import { describe, it, expect } from "vitest";
import { extractCatalogMappings } from "../../src/catalog/extractCatalogMappings.js";

describe("extractCatalogMappings", () => {
    it("captures root-level x-catalog with a bare key", () => {
        const schema = { type: "object", properties: { cardType: { type: "string", "x-catalog": "DebitCardType" } } };
        expect(extractCatalogMappings(schema)).toEqual({ cardType: "DebitCardType" });
    });

    it("keeps the parent path for additionalProperties branches", () => {
        const schema = {
            type: "object",
            properties: {
                status: { type: "string" },
                currencyFolders: {
                    type: "object",
                    additionalProperties: {
                        type: "object",
                        properties: {
                            status: { type: "string", "x-catalog": "CURRENCYFOLDERSTATUS" },
                        },
                    },
                },
            },
        };
        expect(extractCatalogMappings(schema)).toEqual({ "currencyFolders.status": "CURRENCYFOLDERSTATUS" });
    });

    it("merges allOf/anyOf/oneOf into the parent path", () => {
        const schema = {
            allOf: [{ properties: { code: { type: "string", "x-catalog": "CODE" } } }],
            anyOf: [{ properties: { kind: { type: "string", "x-catalog": "KIND" } } }],
            oneOf: [{ properties: { shape: { type: "string", "x-catalog": "SHAPE" } } }],
        };
        const result = extractCatalogMappings(schema);
        expect(result).toEqual({ code: "CODE", kind: "KIND", shape: "SHAPE" });
    });

    it("descends into arrays via items", () => {
        const schema = {
            type: "array",
            items: {
                type: "object",
                properties: { status: { type: "string", "x-catalog": "S" } },
            },
        };
        expect(extractCatalogMappings(schema)).toEqual({ status: "S" });
    });

    it("handles non-object input safely", () => {
        expect(extractCatalogMappings(null)).toEqual({});
        expect(extractCatalogMappings("hi")).toEqual({});
    });
});
