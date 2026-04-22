import { describe, it, expect } from "vitest";
import { cleanSchema } from "../../src/schema/cleanSchema.js";

describe("cleanSchema", () => {
    it("removes x-* attributes at any nesting level", () => {
        const input = {
            type: "object",
            "x-catalog": "A",
            properties: {
                a: { type: "string", "x-asd-attribute": true },
                b: {
                    type: "object",
                    properties: {
                        c: { type: "integer", "x-example": 1 },
                    },
                },
            },
        };
        const cleaned = cleanSchema(input) as any;
        expect(cleaned["x-catalog"]).toBeUndefined();
        expect(cleaned.properties.a["x-asd-attribute"]).toBeUndefined();
        expect(cleaned.properties.b.properties.c["x-example"]).toBeUndefined();
        expect(cleaned.properties.a.type).toBe("string");
    });

    it("preserves arrays element-wise", () => {
        const input = { allOf: [{ "x-extra": 1, type: "string" }, { type: "integer" }] };
        const cleaned = cleanSchema(input) as any;
        expect(cleaned.allOf[0]["x-extra"]).toBeUndefined();
        expect(cleaned.allOf[0].type).toBe("string");
        expect(cleaned.allOf[1].type).toBe("integer");
    });

    it("passes through primitives and null", () => {
        expect(cleanSchema(null)).toBeNull();
        expect(cleanSchema(42)).toBe(42);
        expect(cleanSchema("text")).toBe("text");
        expect(cleanSchema(undefined)).toBeUndefined();
    });

    it("does not mutate the input", () => {
        const input = { "x-catalog": "A", type: "string" };
        const beforeKeys = Object.keys(input).slice();
        cleanSchema(input);
        expect(Object.keys(input)).toEqual(beforeKeys);
    });
});
