import { describe, it, expect } from "vitest";
import { buildAjvFilter } from "../../src/filter/buildAjvFilter.js";
import { applyAjvFilter } from "../../src/filter/applyAjvFilter.js";
import type { Endpoint } from "../../src/types.js";

function endpoint(responses: Endpoint["responses"], path = "/things"): Endpoint {
    return { method: "GET", path, parameters: [], responses };
}

/**
 * Combinator branches (`oneOf` / `anyOf` / `allOf`) deliberately pass
 * through unfiltered — see prepareSchemaForAjv.ts for why locking each
 * branch with `additionalProperties: false` would cause the matching
 * branch to lose its valid fields. These tests pin the current behaviour
 * so a future change has to confront it.
 */
describe("applyAjvFilter — combinators pass through unfiltered", () => {
    it("oneOf: extras inside the matching branch survive", () => {
        const filter = buildAjvFilter({
            endpoint: endpoint({
                "200": {
                    description: "ok",
                    content: {
                        "application/json": {
                            schema: {
                                oneOf: [
                                    { type: "object", properties: { kind: { const: "a" }, a: { type: "string" } }, required: ["kind"] },
                                    { type: "object", properties: { kind: { const: "b" }, b: { type: "number" } }, required: ["kind"] },
                                ],
                            },
                        },
                    },
                },
            }),
            backend: "mch",
            protocol: "mcp",
        })!;

        // Extras pass through — no stripping inside oneOf branches.
        expect(applyAjvFilter({ kind: "a", a: "x", leak: 1 }, filter)).toEqual({ kind: "a", a: "x", leak: 1 });
    });

    it("anyOf: extras pass through", () => {
        const filter = buildAjvFilter({
            endpoint: endpoint({
                "200": {
                    description: "ok",
                    content: {
                        "application/json": {
                            schema: {
                                anyOf: [
                                    { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
                                    { type: "object", properties: { code: { type: "number" } }, required: ["code"] },
                                ],
                            },
                        },
                    },
                },
            }),
            backend: "mch",
            protocol: "mcp",
        })!;

        expect(applyAjvFilter({ id: "1", leak: 1 }, filter)).toEqual({ id: "1", leak: 1 });
    });

    it("allOf: extras pass through", () => {
        const filter = buildAjvFilter({
            endpoint: endpoint({
                "200": {
                    description: "ok",
                    content: {
                        "application/json": {
                            schema: {
                                allOf: [
                                    { type: "object", properties: { id: { type: "string" } } },
                                    { type: "object", properties: { name: { type: "string" } } },
                                ],
                            },
                        },
                    },
                },
            }),
            backend: "mch",
            protocol: "mcp",
        })!;

        expect(applyAjvFilter({ id: "1", name: "a", leak: true }, filter)).toEqual({ id: "1", name: "a", leak: true });
    });

    it("strips extras at the OUTER object level even when a property uses oneOf", () => {
        // Combinators inside an object property still pass through, but the
        // outer object's extras get stripped because the outer node is a
        // plain object that the rewrite pass locks.
        const filter = buildAjvFilter({
            endpoint: endpoint({
                "200": {
                    description: "ok",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    payload: {
                                        oneOf: [
                                            { type: "object", properties: { kind: { const: "a" }, a: { type: "string" } } },
                                            { type: "object", properties: { kind: { const: "b" }, b: { type: "number" } } },
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            backend: "mch",
            protocol: "mcp",
        })!;

        const out = applyAjvFilter(
            { id: "1", outerLeak: "DROP", payload: { kind: "a", a: "x", innerLeak: "KEEP" } },
            filter,
        );
        expect(out).toEqual({ id: "1", payload: { kind: "a", a: "x", innerLeak: "KEEP" } });
    });
});
