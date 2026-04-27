import { describe, it, expect } from "vitest";
import { applyAjvFilter } from "../../src/filter/applyAjvFilter.js";
import { SchemaFilterError } from "../../src/errors.js";
import type { AjvFilterDefinition } from "../../src/types.js";

function filter(overrides: Partial<AjvFilterDefinition> = {}): AjvFilterDefinition {
    return {
        backend: "mch",
        protocol: "mcp",
        operation: "getX",
        responseSchema: { type: "object", properties: {} },
        ...overrides,
    };
}

describe("applyAjvFilter", () => {
    it("returns null and undefined unchanged", () => {
        expect(applyAjvFilter(null, filter())).toBeNull();
        expect(applyAjvFilter(undefined, filter())).toBeUndefined();
    });

    it("strips top-level extras", () => {
        const def = filter({
            responseSchema: { type: "object", properties: { id: { type: "string" } } },
        });
        expect(applyAjvFilter({ id: "1", secret: "x" }, def)).toEqual({ id: "1" });
    });

    it("strips extras at every depth, structurally", () => {
        const def = filter({
            responseSchema: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    owner: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            name: { type: "string" },
                        },
                    },
                },
            },
        });
        const out = applyAjvFilter(
            { id: "acct-1", ssn: "x", owner: { id: 42, ssn: "y", name: "Alice" } },
            def,
        );
        expect(out).toEqual({ id: "acct-1", owner: { id: 42, name: "Alice" } });
    });

    it("filters arrays item-by-item using the items schema", () => {
        const def = filter({
            responseSchema: {
                type: "array",
                items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
            },
        });
        const out = applyAjvFilter([{ id: "1", name: "a", extra: "nope" }], def);
        expect(out).toEqual([{ id: "1", name: "a" }]);
    });

    it("preserves dynamic object keys via additionalProperties", () => {
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
        const out = applyAjvFilter(
            {
                currencyFolders: {
                    CZK: { balance: 10, status: "1", junk: true },
                    USD: { balance: 2, status: "1" },
                },
            },
            def,
        ) as any;
        expect(Object.keys(out.currencyFolders)).toEqual(["CZK", "USD"]);
        expect(out.currencyFolders.CZK).toEqual({ balance: 10, status: "1" });
    });

    it("does not mutate the input", () => {
        const def = filter({
            responseSchema: { type: "object", properties: { id: { type: "string" } } },
        });
        const input = { id: "1", secret: "x" };
        applyAjvFilter(input, def);
        expect(input).toEqual({ id: "1", secret: "x" });
    });

    it("throws by default when AJV compile fails on a malformed schema", () => {
        // `type: "bogus"` is not a valid JSON Schema type; AJV throws at compile time.
        const def = filter({ responseSchema: { type: "bogus" } });
        expect(() => applyAjvFilter({ a: 1 }, def)).toThrow(SchemaFilterError);
    });

    it("passthrough mode returns original data on error", () => {
        const def = filter({ responseSchema: { type: "bogus" } });
        const input = { a: 1 };
        expect(applyAjvFilter(input, def, { onError: "passthrough" })).toBe(input);
    });

    it("caches the compiled validator per filter instance", () => {
        const def = filter({
            responseSchema: { type: "object", properties: { id: { type: "string" } } },
        });
        const a = applyAjvFilter({ id: "1", x: 1 }, def);
        const b = applyAjvFilter({ id: "2", y: 2 }, def);
        expect(a).toEqual({ id: "1" });
        expect(b).toEqual({ id: "2" });
    });
});
