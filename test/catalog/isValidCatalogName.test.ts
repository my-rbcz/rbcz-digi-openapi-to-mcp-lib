import { describe, it, expect } from "vitest";
import { isValidCatalogName } from "../../src/catalog/isValidCatalogName.js";

describe("isValidCatalogName", () => {
    it("accepts normal strings", () => {
        expect(isValidCatalogName("Foo")).toBe(true);
        expect(isValidCatalogName("  Foo  ")).toBe(true);
    });

    it("rejects non-strings, empties, comments, and trailing dots", () => {
        expect(isValidCatalogName(42)).toBe(false);
        expect(isValidCatalogName("")).toBe(false);
        expect(isValidCatalogName("   ")).toBe(false);
        expect(isValidCatalogName("Foo # c")).toBe(false);
        expect(isValidCatalogName("Foo.")).toBe(false);
        expect(isValidCatalogName(null)).toBe(false);
        expect(isValidCatalogName(undefined)).toBe(false);
    });
});
