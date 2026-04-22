import { describe, it, expect } from "vitest";
import { collectAllProperties } from "../../src/schema/collectAllProperties.js";

describe("collectAllProperties", () => {
    it("returns flat union across direct properties and allOf/anyOf/oneOf", () => {
        const schema = {
            properties: { a: { type: "string" } },
            allOf: [{ properties: { b: { type: "string" } } }],
            anyOf: [{ properties: { c: { type: "string" } } }],
            oneOf: [{ properties: { d: { type: "string" } } }],
        };
        expect(Array.from(collectAllProperties(schema)).sort()).toEqual(["a", "b", "c", "d"]);
    });

    it("excludes x-asd-attribute and x-example keys", () => {
        const schema = {
            properties: {
                real: { type: "string" },
                "x-asd-attribute": {},
                "x-example": {},
            },
        };
        expect(Array.from(collectAllProperties(schema))).toEqual(["real"]);
    });

    it("handles non-object input safely", () => {
        expect(collectAllProperties(null).size).toBe(0);
        expect(collectAllProperties("no").size).toBe(0);
    });
});
