import { describe, it, expect } from "vitest";
import { enhanceErrorMessage } from "../../src/validation/enhanceErrorMessage.js";

describe("enhanceErrorMessage", () => {
    it("rewrites per-keyword messages", () => {
        expect(
            enhanceErrorMessage({
                keyword: "required",
                params: { missingProperty: "x" },
                instancePath: "",
                schemaPath: "",
                data: {},
            } as any)
        ).toBe("Missing required field: x");

        expect(
            enhanceErrorMessage({
                keyword: "type",
                params: { type: "string" },
                instancePath: "",
                schemaPath: "",
                data: 1,
            } as any)
        ).toBe("Expected type 'string' but got 'number'");

        expect(
            enhanceErrorMessage({
                keyword: "enum",
                params: { allowedValues: ["a", "b"] },
                instancePath: "",
                schemaPath: "",
                data: "c",
            } as any)
        ).toBe("Value must be one of: a, b");

        expect(
            enhanceErrorMessage({
                keyword: "minimum",
                params: { limit: 10 },
                instancePath: "",
                schemaPath: "",
                data: 5,
            } as any)
        ).toContain("minimum");

        expect(
            enhanceErrorMessage({
                keyword: "format",
                params: { format: "email" },
                instancePath: "",
                schemaPath: "",
                data: "no",
                message: "must match format",
            } as any)
        ).toContain("email");

        expect(
            enhanceErrorMessage({
                keyword: "unknown",
                params: {},
                instancePath: "",
                schemaPath: "",
                data: null,
                message: "fallback",
            } as any)
        ).toBe("fallback");
    });
});
