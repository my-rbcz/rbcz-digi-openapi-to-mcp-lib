import { describe, it, expect } from "vitest";
import { buildAjvFilter } from "../../src/filter/buildAjvFilter.js";
import { applyAjvFilter } from "../../src/filter/applyAjvFilter.js";
import type { Endpoint } from "../../src/types.js";

function endpoint(responses: Endpoint["responses"], path = "/things"): Endpoint {
    return { method: "GET", path, parameters: [], responses };
}

/**
 * `oneOf` / `anyOf` branches deliberately pass through unfiltered — see
 * prepareSchemaForAjv.ts for why locking each branch with
 * `additionalProperties: false` would cause the matching branch to lose
 * its valid fields. `allOf` is different: it's a schema intersection, so
 * its branch-declared properties get hoisted into the parent and the
 * parent strips extras normally. These tests pin both behaviours.
 */
describe("applyAjvFilter — combinator handling", () => {
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

    it("allOf at the root (no parent type/properties): extras pass through", () => {
        // No `type: "object"` and no own `properties` at the parent → the
        // parent isn't an object node, so nothing locks it. Branches are
        // not recursed into either, so extras survive.
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

    it("allOf on a `type: object` parent: branch properties survive, extras strip", () => {
        // Mirrors the real-world UserInfoResponseUser shape: parent has
        // `type: object` + `allOf` and no own `properties`. Without the
        // hoist, AJV's `removeAdditional` would strip every field.
        const filter = buildAjvFilter({
            endpoint: endpoint({
                "200": {
                    description: "ok",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                allOf: [
                                    { type: "object", properties: { title: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" } } },
                                    { type: "object", properties: { loginName: { type: "string" }, birthDate: { type: "string" } } },
                                ],
                            },
                        },
                    },
                },
            }),
            backend: "mch",
            protocol: "mcp",
        })!;

        expect(
            applyAjvFilter(
                { title: "Ing.", firstName: "Martin", lastName: "Novak", loginName: "23432423342", birthDate: "1985-04-12", leak: true },
                filter,
            ),
        ).toEqual({ title: "Ing.", firstName: "Martin", lastName: "Novak", loginName: "23432423342", birthDate: "1985-04-12" });
    });

    it("allOf nested inside a property: hoisted properties keep, extras at that level strip", () => {
        const filter = buildAjvFilter({
            endpoint: endpoint({
                "200": {
                    description: "ok",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    user: {
                                        type: "object",
                                        allOf: [
                                            { type: "object", properties: { title: { type: "string" }, firstName: { type: "string" } } },
                                            { type: "object", properties: { loginName: { type: "string" } } },
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
            { user: { title: "Ing.", firstName: "Martin", loginName: "x", leak: true }, outerLeak: 1 },
            filter,
        );
        expect(out).toEqual({ user: { title: "Ing.", firstName: "Martin", loginName: "x" } });
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
