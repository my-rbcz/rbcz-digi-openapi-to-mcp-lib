import { describe, it, expect } from "vitest";
import { transformNullableSchema } from "../../src/schema/transformNullableSchema.js";

describe("transformNullableSchema", () => {
    it("converts nullable:true + string type to [type,'null']", () => {
        const out = transformNullableSchema({ type: "string", nullable: true }) as any;
        expect(out.type).toEqual(["string", "null"]);
        expect(out.nullable).toBeUndefined();
    });

    it("recurses into properties, items, allOf, anyOf, oneOf, additionalProperties", () => {
        const input = {
            type: "object",
            properties: {
                a: { type: "string", nullable: true },
                b: { type: "array", items: { type: "integer", nullable: true } },
            },
            allOf: [{ type: "string", nullable: true }],
            anyOf: [{ type: "number", nullable: true }],
            oneOf: [{ type: "boolean", nullable: true }],
            additionalProperties: { type: "string", nullable: true },
        };
        const out = transformNullableSchema(input) as any;
        expect(out.properties.a.type).toEqual(["string", "null"]);
        expect(out.properties.b.items.type).toEqual(["integer", "null"]);
        expect(out.allOf[0].type).toEqual(["string", "null"]);
        expect(out.anyOf[0].type).toEqual(["number", "null"]);
        expect(out.oneOf[0].type).toEqual(["boolean", "null"]);
        expect(out.additionalProperties.type).toEqual(["string", "null"]);
    });

    it("leaves array types untouched (non-string type)", () => {
        const out = transformNullableSchema({ type: ["string", "integer"], nullable: true }) as any;
        expect(out.type).toEqual(["string", "integer"]);
    });

    it("passes through primitives, arrays, and null", () => {
        expect(transformNullableSchema(null)).toBeNull();
        expect(transformNullableSchema(42)).toBe(42);
        expect(transformNullableSchema([{ nullable: true, type: "string" }])).toEqual([{ type: ["string", "null"] }]);
    });
});
