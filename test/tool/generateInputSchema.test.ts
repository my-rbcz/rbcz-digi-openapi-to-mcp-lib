import { describe, it, expect } from "vitest";
import { generateInputSchema } from "../../src/tool/generateInputSchema.js";
import type { Endpoint } from "../../src/types.js";

function endpoint(overrides: Partial<Endpoint>): Endpoint {
    return {
        method: "GET",
        path: "/x",
        parameters: [],
        responses: {},
        ...overrides,
    };
}

describe("generateInputSchema", () => {
    it("empty endpoint → empty object schema with no required", () => {
        const schema = generateInputSchema(endpoint({}));
        expect(schema).toEqual({ type: "object", properties: {} });
    });

    it("merges path and query parameters and records required list", () => {
        const schema = generateInputSchema(
            endpoint({
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" }, description: "The ID" },
                    { name: "expand", in: "query", required: false, schema: { type: "string" } },
                    { name: "limit", in: "query", required: true, schema: { type: "integer" } },
                ],
            })
        ) as any;
        expect(schema.properties.id.description).toBe("The ID");
        expect(schema.properties.expand).toBeDefined();
        expect(schema.properties.limit).toBeDefined();
        expect(schema.required).toEqual(["id", "limit"]);
    });

    it("flattens object body properties and merges required", () => {
        const schema = generateInputSchema(
            endpoint({
                method: "POST",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["a"],
                                properties: {
                                    a: { type: "string", "x-catalog": "DROP" },
                                    b: { type: "integer" },
                                },
                            },
                        },
                    },
                },
            })
        ) as any;
        expect(schema.properties.a).toEqual({ type: "string" });
        expect(schema.properties.b).toEqual({ type: "integer" });
        expect(schema.required).toEqual(["a"]);
    });

    it("wraps non-object bodies under `body` with the required flag", () => {
        const schema = generateInputSchema(
            endpoint({
                method: "POST",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { type: "string", format: "binary" },
                        },
                    },
                },
            })
        ) as any;
        expect(schema.properties.body).toEqual({ type: "string", format: "binary", description: "Request body" });
        expect(schema.required).toEqual(["body"]);
    });

    it("ignores bodies without application/json content", () => {
        const schema = generateInputSchema(
            endpoint({
                method: "POST",
                requestBody: { required: true, content: { "text/plain": { schema: { type: "string" } } } },
            })
        ) as any;
        expect(schema.properties).toEqual({});
        expect(schema.required).toBeUndefined();
    });
});
