import { describe, it, expect } from "vitest";
import { collectBodyProperties } from "../../src/tool/collectBodyProperties.js";
import type { RequestBody } from "../../src/types.js";

describe("collectBodyProperties", () => {
    it("returns empty result when requestBody is undefined", () => {
        expect(collectBodyProperties(undefined)).toEqual({ properties: {}, required: [] });
    });

    it("returns empty result when there is no application/json media type", () => {
        const rb: RequestBody = {
            required: true,
            content: { "text/plain": { schema: { type: "string" } } },
        };
        expect(collectBodyProperties(rb)).toEqual({ properties: {}, required: [] });
    });

    it("returns empty result when the application/json media type has no schema", () => {
        const rb = {
            required: true,
            content: { "application/json": {} },
        } as unknown as RequestBody;
        expect(collectBodyProperties(rb)).toEqual({ properties: {}, required: [] });
    });

    it("returns empty result when the schema is not an object (e.g. a boolean)", () => {
        const rb = {
            required: true,
            content: { "application/json": { schema: true } },
        } as unknown as RequestBody;
        expect(collectBodyProperties(rb)).toEqual({ properties: {}, required: [] });
    });

    it("flattens object bodies: promotes properties and propagates required array", () => {
        const rb: RequestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        required: ["a", "c"],
                        properties: {
                            a: { type: "string" },
                            b: { type: "integer" },
                            c: { type: "boolean" },
                        },
                    },
                },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties).toEqual({
            a: { type: "string" },
            b: { type: "integer" },
            c: { type: "boolean" },
        });
        expect(result.required).toEqual(["a", "c"]);
    });

    it("strips x-* attributes from flattened object property schemas via cleanSchema", () => {
        const rb: RequestBody = {
            required: false,
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            a: { type: "string", "x-catalog": "DROP", description: "keep me" },
                        },
                    },
                },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties.a).toEqual({ type: "string", description: "keep me" });
        expect(result.required).toEqual([]);
    });

    it("returns empty required list when object body omits the required array", () => {
        const rb: RequestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: { a: { type: "string" } },
                    },
                },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties).toEqual({ a: { type: "string" } });
        expect(result.required).toEqual([]);
    });

    it("ignores a non-array `required` field on object bodies", () => {
        const rb = {
            required: true,
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        required: "not-an-array",
                        properties: { a: { type: "string" } },
                    },
                },
            },
        } as unknown as RequestBody;
        const result = collectBodyProperties(rb);
        expect(result.required).toEqual([]);
    });

    it("wraps object schemas without a properties block under `body`", () => {
        const rb: RequestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { type: "object", additionalProperties: { type: "number" } },
                },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties.body).toEqual({
            type: "object",
            additionalProperties: { type: "number" },
            description: "Request body",
        });
        expect(result.required).toEqual(["body"]);
    });

    it("wraps primitive (non-object) bodies under `body` with the default description", () => {
        const rb: RequestBody = {
            required: true,
            content: {
                "application/json": { schema: { type: "string", format: "binary" } },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties.body).toEqual({
            type: "string",
            format: "binary",
            description: "Request body",
        });
        expect(result.required).toEqual(["body"]);
    });

    it("preserves an existing description when wrapping non-object bodies", () => {
        const rb: RequestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { type: "string", description: "Raw payload" },
                },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties.body).toEqual({ type: "string", description: "Raw payload" });
        expect(result.required).toEqual(["body"]);
    });

    it("omits body from required when the request body is optional", () => {
        const rb: RequestBody = {
            required: false,
            content: {
                "application/json": { schema: { type: "string" } },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties.body).toEqual({ type: "string", description: "Request body" });
        expect(result.required).toEqual([]);
    });

    it("wraps array bodies under `body`", () => {
        const rb: RequestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { type: "array", items: { type: "string" } },
                },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties.body).toEqual({
            type: "array",
            items: { type: "string" },
            description: "Request body",
        });
        expect(result.required).toEqual(["body"]);
    });

    it("strips x-* attributes from wrapped non-object bodies", () => {
        const rb: RequestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { type: "string", "x-catalog": "DROP" },
                },
            },
        };
        const result = collectBodyProperties(rb);
        expect(result.properties.body).toEqual({ type: "string", description: "Request body" });
    });

    it("does not mutate the input request body schema", () => {
        const schema = {
            type: "object",
            required: ["a"],
            properties: { a: { type: "string", "x-catalog": "DROP" } },
        };
        const rb: RequestBody = {
            required: true,
            content: { "application/json": { schema } },
        };
        collectBodyProperties(rb);
        expect(schema.properties.a).toEqual({ type: "string", "x-catalog": "DROP" });
        expect(schema.required).toEqual(["a"]);
    });
});
