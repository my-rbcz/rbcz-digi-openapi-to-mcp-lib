import { describe, it, expect } from "vitest";
import { applyPathParameters } from "../../src/tool/applyPathParameters.js";
import { ToolCallError } from "../../src/errors.js";

describe("applyPathParameters", () => {
    it("substitutes a single placeholder", () => {
        expect(applyPathParameters("/users/{id}", { id: "42" })).toBe("/users/42");
    });

    it("substitutes multiple placeholders", () => {
        expect(
            applyPathParameters("/accounts/{accountId}/transactions/{txId}", {
                accountId: "a",
                txId: "b",
            }),
        ).toBe("/accounts/a/transactions/b");
    });

    it("URL-encodes path segments (slashes, spaces, unicode)", () => {
        expect(applyPathParameters("/users/{id}", { id: "a/b c" })).toBe("/users/a%2Fb%20c");
        expect(applyPathParameters("/users/{id}", { id: "ščř" })).toBe(
            "/users/%C5%A1%C4%8D%C5%99",
        );
    });

    it("coerces non-string primitives via String()", () => {
        expect(applyPathParameters("/users/{id}", { id: 7 })).toBe("/users/7");
        expect(applyPathParameters("/users/{flag}", { flag: true })).toBe("/users/true");
    });

    it("returns the path unchanged when there are no placeholders", () => {
        expect(applyPathParameters("/clients", {})).toBe("/clients");
    });

    it("throws ToolCallError when a placeholder has no value", () => {
        expect(() => applyPathParameters("/users/{id}", {})).toThrow(ToolCallError);
        expect(() => applyPathParameters("/users/{id}", { id: undefined })).toThrow(
            /Missing path parameter: id/,
        );
        expect(() => applyPathParameters("/users/{id}", { id: null })).toThrow(ToolCallError);
    });
});