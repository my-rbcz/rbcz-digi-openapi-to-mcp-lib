import { describe, it, expect } from "vitest";
import { extractCatalogNames } from "../../src/catalog/extractCatalogNames.js";

describe("extractCatalogNames", () => {
    it("collects deduplicated, sorted catalog names", () => {
        const doc = {
            a: { "x-catalog": "Zeta" },
            b: { nested: { "x-catalog": "Alpha" } },
            c: [{ "x-catalog": "Alpha" }],
        };
        expect(extractCatalogNames(doc)).toEqual(["Alpha", "Zeta"]);
    });

    it("trims whitespace and rejects invalid catalogs", () => {
        const doc = {
            good: { "x-catalog": "  MyCatalog  " },
            commented: { "x-catalog": "Foo # TODO" },
            trailing: { "x-catalog": "Bar." },
            empty: { "x-catalog": "   " },
            bogus: { "x-catalog": 123 },
        };
        expect(extractCatalogNames(doc)).toEqual(["MyCatalog"]);
    });

    it("returns an empty list for primitives and null", () => {
        expect(extractCatalogNames(null)).toEqual([]);
        expect(extractCatalogNames("text")).toEqual([]);
        expect(extractCatalogNames(42)).toEqual([]);
    });
});
