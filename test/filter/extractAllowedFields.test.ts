import { describe, it, expect } from "vitest";
import { extractAllowedFields } from "../../src/filter/extractAllowedFields.js";

describe("extractAllowedFields", () => {
    it("walks properties, combinators, items, and additionalProperties", () => {
        const schema = {
            type: "object",
            properties: { id: { type: "string" } },
            allOf: [{ properties: { baseField: { type: "string" } } }],
            anyOf: [{ properties: { maybeField: { type: "string" } } }],
            oneOf: [{ properties: { oneField: { type: "string" } } }],
            additionalProperties: {
                type: "object",
                properties: { child: { type: "string" } },
            },
        };
        const list = extractAllowedFields(schema).sort();
        expect(list).toEqual(["baseField", "child", "id", "maybeField", "oneField"]);
    });

    it("descends into array items", () => {
        const schema = { type: "array", items: { properties: { inner: { type: "string" } } } };
        expect(extractAllowedFields(schema)).toEqual(["inner"]);
    });

    it("excludes x-asd-attribute and x-example", () => {
        const schema = {
            properties: {
                real: { type: "string" },
                "x-asd-attribute": {},
                "x-example": {},
            },
        };
        expect(extractAllowedFields(schema)).toEqual(["real"]);
    });

    it("returns empty list for invalid input", () => {
        expect(extractAllowedFields(null)).toEqual([]);
        expect(extractAllowedFields(123)).toEqual([]);
    });
});
