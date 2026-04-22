import { describe, it, expect } from "vitest";
import { generateOutputSchema } from "../../src/tool/generateOutputSchema.js";
import type { Endpoint } from "../../src/types.js";

function endpoint(overrides: Partial<Endpoint>): Endpoint {
    return { method: "GET", path: "/x", parameters: [], responses: {}, ...overrides };
}

describe("generateOutputSchema", () => {
    it("returns generic schema when no success response is defined", () => {
        expect(generateOutputSchema(endpoint({}))).toEqual({ type: "object", description: "Response from API" });
    });

    it("returns description-only schema when JSON content is missing", () => {
        const schema = generateOutputSchema(
            endpoint({ responses: { "200": { description: "Only XML here" } } })
        );
        expect(schema).toEqual({ type: "object", description: "Only XML here" });
    });

    it("prefers 200 over 201 and 204", () => {
        const schema = generateOutputSchema(
            endpoint({
                responses: {
                    "201": { description: "Created", content: { "application/json": { schema: { type: "object", properties: { x: { type: "string" } } } } } },
                    "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { y: { type: "string" } } } } } },
                    "204": { description: "NC" },
                },
            })
        ) as any;
        expect(schema.properties.y).toBeDefined();
        expect(schema.properties.x).toBeUndefined();
    });

    it("cleans x-* and transforms nullable", () => {
        const schema = generateOutputSchema(
            endpoint({
                path: "/cards",
                responses: {
                    "200": {
                        description: "Cards",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    "x-example": { cardId: "1" },
                                    properties: {
                                        cardId: { type: "string" },
                                        distributionDate: { type: "string", nullable: true },
                                    },
                                },
                            },
                        },
                    },
                },
            })
        ) as any;
        expect(schema["x-example"]).toBeUndefined();
        expect(schema.properties.distributionDate.type).toEqual(["string", "null"]);
        expect(schema.description).toBeUndefined();
    });

    it("wraps array schemas with a wrapper key derived from the tool name", () => {
        const schema = generateOutputSchema(
            endpoint({
                method: "GET",
                path: "/clients",
                responses: {
                    "200": {
                        description: "Clients",
                        content: { "application/json": { schema: { type: "array", items: { type: "object" } } } },
                    },
                },
            })
        ) as any;
        expect(schema.type).toBe("object");
        expect(schema.properties.clients.type).toBe("array");
        expect(schema.required).toEqual(["clients"]);
    });
});
