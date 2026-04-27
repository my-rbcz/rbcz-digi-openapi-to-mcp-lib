import { describe, it, expect } from "vitest";
import { applyAjvFilter } from "../../src/filter/applyAjvFilter.js";
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

describe("applyAjvFilter — OpenAPI 3.0 nullable lowering", () => {
    it("preserves null values for fields marked nullable: true", () => {
        const def = filter({
            responseSchema: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    middleName: { type: "string", nullable: true },
                    age: { type: "integer", nullable: true },
                },
            },
        });

        expect(applyAjvFilter({ id: "u-1", middleName: null, age: null }, def))
            .toEqual({ id: "u-1", middleName: null, age: null });
    });

    it("strips undeclared siblings while preserving nullable fields", () => {
        const def = filter({
            responseSchema: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    middleName: { type: "string", nullable: true },
                },
            },
        });

        expect(applyAjvFilter({ id: "u-1", middleName: null, leak: "DROP ME" }, def))
            .toEqual({ id: "u-1", middleName: null });
    });

    it("handles nullable inside arrays", () => {
        const def = filter({
            responseSchema: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        nick: { type: "string", nullable: true },
                    },
                },
            },
        });

        expect(applyAjvFilter([{ id: "1", nick: null, leak: 1 }, { id: "2", nick: "ok" }], def))
            .toEqual([{ id: "1", nick: null }, { id: "2", nick: "ok" }]);
    });

    it("handles nullable inside dynamic-key (additionalProperties) objects", () => {
        const def = filter({
            responseSchema: {
                type: "object",
                properties: {
                    folders: {
                        type: "object",
                        additionalProperties: {
                            type: "object",
                            properties: {
                                balance: { type: "number" },
                                lastTx: { type: "string", nullable: true },
                            },
                        },
                    },
                },
            },
        });

        expect(applyAjvFilter(
            { folders: { CZK: { balance: 10, lastTx: null, junk: 1 } } },
            def,
        )).toEqual({ folders: { CZK: { balance: 10, lastTx: null } } });
    });
});
