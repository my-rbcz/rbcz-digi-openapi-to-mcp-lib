import { describe, it, expect } from "vitest";
import { formatValidationErrors } from "../../src/validation/formatValidationErrors.js";

describe("formatValidationErrors", () => {
    it("normalizes field paths and preserves keyword/schemaPath/value", () => {
        const [out] = formatValidationErrors([
            {
                keyword: "type",
                params: { type: "string" },
                instancePath: "/user/0/name",
                schemaPath: "#/properties/user/items/properties/name/type",
                data: 42,
            } as any,
        ]);
        expect(out?.field).toBe("user.0.name");
        expect(out?.keyword).toBe("type");
        expect(out?.value).toBe(42);
        expect(out?.schemaPath).toContain("#/properties");
    });

    it("falls back to 'root' when path is empty", () => {
        const [out] = formatValidationErrors([
            { keyword: "type", params: { type: "object" }, instancePath: "", schemaPath: "", data: "x" } as any,
        ]);
        expect(out?.field).toBe("root");
    });
});
