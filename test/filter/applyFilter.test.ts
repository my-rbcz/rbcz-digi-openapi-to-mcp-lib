import { describe, it, expect } from "vitest";
import { applyFilter } from "../../src/filter/applyFilter.js";
import { SchemaFilterError } from "../../src/errors.js";
import type { SchemaFilterDefinition } from "../../src/types.js";

function filter(overrides: Partial<SchemaFilterDefinition> = {}): SchemaFilterDefinition {
    return {
        backend: "mch",
        protocol: "mcp",
        operation: "getX",
        allowedFields: [],
        responseSchema: undefined,
        catalogMappings: {},
        ...overrides,
    };
}

describe("applyFilter", () => {
    it("returns null and undefined unchanged", () => {
        expect(applyFilter(null, filter())).toBeNull();
        expect(applyFilter(undefined, filter())).toBeUndefined();
    });

    it("filters arrays item-by-item using the items schema", () => {
        const def = filter({
            responseSchema: {
                type: "array",
                items: { type: "object", properties: { id: { type: "string" }, status: { type: "string" } } },
            },
        });
        const out = applyFilter([{ id: "1", status: "ok", extra: "nope" }], def);
        expect(out).toEqual([{ id: "1", status: "ok" }]);
    });

    it("does NOT coerce arrays into objects (regression: Object.keys pitfall)", () => {
        const def = filter({
            responseSchema: {
                type: "array",
                items: { type: "object", properties: { id: { type: "string" } } },
            },
        });
        const out = applyFilter([{ id: "a" }, { id: "b" }, { id: "c" }], def) as any[];
        expect(Array.isArray(out)).toBe(true);
        expect(out).toHaveLength(3);
    });

    it("preserves dynamic object keys and filters their values", () => {
        const def = filter({
            responseSchema: {
                type: "object",
                properties: {
                    currencyFolders: {
                        type: "object",
                        additionalProperties: {
                            type: "object",
                            properties: { balance: { type: "number" }, status: { type: "string" } },
                        },
                    },
                },
            },
        });
        const out = applyFilter({ currencyFolders: { CZK: { balance: 10, status: "1", junk: true }, USD: { balance: 2, status: "1" } } }, def) as any;
        expect(Object.keys(out.currencyFolders)).toEqual(["CZK", "USD"]);
        expect(out.currencyFolders.CZK).toEqual({ balance: 10, status: "1" });
    });

    it("drops fields not in the schema", () => {
        const def = filter({
            responseSchema: { type: "object", properties: { id: { type: "string" } } },
        });
        expect(applyFilter({ id: "1", secret: "x" }, def)).toEqual({ id: "1" });
    });

    it("always removes x-asd-attribute and x-example", () => {
        const def = filter({
            responseSchema: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    "x-asd-attribute": { type: "string" },
                    "x-example": { type: "string" },
                },
            },
        });
        const out = applyFilter({ id: "1", "x-asd-attribute": "a", "x-example": "b" }, def);
        expect(out).toEqual({ id: "1" });
    });

    it("falls back to the flat allowedFields list when schema has no structure", () => {
        const def = filter({ allowedFields: ["id"], responseSchema: undefined });
        expect(applyFilter({ id: "1", other: "x" }, def)).toEqual({ id: "1" });
    });

    it("returns a clone when no restrictions apply", () => {
        const def = filter({ allowedFields: [], responseSchema: undefined });
        const input = { a: 1, b: 2 };
        const out = applyFilter(input, def) as any;
        expect(out).toEqual(input);
        expect(out).not.toBe(input);
    });

    it("passthrough mode returns original data on error", () => {
        // Force an error by providing an object whose entries will blow up the walker.
        const def = filter({
            responseSchema: { type: "object", properties: { x: { type: "string" } } },
        });
        const explosive = Object.create({}, {
            x: {
                enumerable: true,
                get() {
                    throw new Error("boom");
                },
            },
        });
        expect(applyFilter(explosive, def, { onError: "passthrough" })).toBe(explosive);
        expect(() => applyFilter(explosive, def)).toThrow(SchemaFilterError);
    });
});
