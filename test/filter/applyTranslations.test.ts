import { describe, it, expect } from "vitest";
import { applyTranslations } from "../../src/filter/applyTranslations.js";
import { SchemaFilterError } from "../../src/errors.js";
import type { CodeLookup } from "../../src/types.js";

const upper: CodeLookup = (_catalog, value) => `T(${value})`;

describe("applyTranslations", () => {
    it("is a no-op when mappings are empty", () => {
        const input = { a: 1, b: "x" };
        expect(applyTranslations(input, {}, upper)).toBe(input);
    });

    it("translates exact-path matches", () => {
        const data = { cardType: "3", other: "X" };
        const out = applyTranslations(data, { cardType: "DebitCardType" }, upper) as any;
        expect(out.cardType).toBe("T(3)");
        expect(out.other).toBe("X");
    });

    it("uses parent-path fallback for dynamic additionalProperties keys", () => {
        const data = { currencyFolders: { CZK: { status: "1" }, USD: { status: "1" } }, status: "1" };
        const out = applyTranslations(data, { "currencyFolders.status": "CURRENCYFOLDERSTATUS" }, upper) as any;
        expect(out.currencyFolders.CZK.status).toBe("T(1)");
        expect(out.currencyFolders.USD.status).toBe("T(1)");
        expect(out.status).toBe("1");
    });

    it("uses plain field-name fallback only at the top level", () => {
        const out = applyTranslations({ status: "1" }, { status: "S" }, upper) as any;
        expect(out.status).toBe("T(1)");
    });

    it("passes through null and primitive values", () => {
        expect(applyTranslations(null, { a: "X" }, upper)).toBeNull();
        expect(applyTranslations(5, { a: "X" }, upper)).toBe(5);
    });

    it("throws SchemaFilterError by default and respects passthrough mode", () => {
        const lookup: CodeLookup = () => {
            throw new Error("lookup boom");
        };
        const data = { status: "1" };
        expect(() => applyTranslations(data, { status: "S" }, lookup)).toThrow(SchemaFilterError);
        expect(applyTranslations(data, { status: "S" }, lookup, { onError: "passthrough" })).toBe(data);
    });
});
