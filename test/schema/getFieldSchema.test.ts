import { describe, it, expect } from "vitest";
import { getFieldSchema } from "../../src/schema/getFieldSchema.js";

describe("getFieldSchema", () => {
    it("finds direct properties", () => {
        const schema = { properties: { a: { type: "string" } } };
        expect(getFieldSchema(schema, "a")).toEqual({ type: "string" });
    });

    it("searches allOf subschemas", () => {
        const schema = { allOf: [{ properties: { b: { type: "integer" } } }] };
        expect(getFieldSchema(schema, "b")).toEqual({ type: "integer" });
    });

    it("searches anyOf/oneOf subschemas", () => {
        const anyOfSchema = { anyOf: [{ properties: { x: { type: "boolean" } } }] };
        expect(getFieldSchema(anyOfSchema, "x")).toEqual({ type: "boolean" });
        const oneOfSchema = { oneOf: [{ properties: { y: { type: "number" } } }] };
        expect(getFieldSchema(oneOfSchema, "y")).toEqual({ type: "number" });
    });

    it("returns null for missing fields and invalid input", () => {
        expect(getFieldSchema({ properties: {} }, "none")).toBeNull();
        expect(getFieldSchema(null, "x")).toBeNull();
        expect(getFieldSchema([1, 2], "x")).toBeNull();
    });
});
