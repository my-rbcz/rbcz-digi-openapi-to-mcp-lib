import { describe, it, expect } from "vitest";
import { summarizeErrors } from "../../src/validation/summarizeErrors.js";

describe("summarizeErrors", () => {
    it("groups by keyword and counts unique fields", () => {
        const out = summarizeErrors([
            { field: "a", message: "", value: null, keyword: "required" },
            { field: "a", message: "", value: null, keyword: "type" },
            { field: "b", message: "", value: null, keyword: "type" },
            { field: "c", message: "", value: null },
        ]);
        expect(out).toMatch(/4 validation error\(s\) in 3 field\(s\)/);
        expect(out).toContain("1 required");
        expect(out).toContain("2 type");
        expect(out).toContain("1 unknown");
    });
});
