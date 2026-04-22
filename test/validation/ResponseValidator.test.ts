import { describe, it, expect } from "vitest";
import { ResponseValidator } from "../../src/validation/ResponseValidator.js";

describe("ResponseValidator", () => {
    it("returns valid=true when the schema has no properties", () => {
        const rv = new ResponseValidator();
        expect(rv.validateResponse("tool", { anything: 1 }, { type: "object" })).toEqual({ valid: true });
        expect(rv.validateResponse("tool", 1, null)).toEqual({ valid: true });
    });

    it("returns valid=true for correct data", () => {
        const rv = new ResponseValidator();
        const schema = {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" } },
        };
        expect(rv.validateResponse("t1", { id: "1" }, schema)).toEqual({ valid: true });
    });

    it("reports required/type/format/enum/min/max errors", () => {
        const rv = new ResponseValidator();
        const schema = {
            type: "object",
            required: ["id", "kind", "email", "n", "missing"],
            properties: {
                id: { type: "string" },
                kind: { type: "string", enum: ["a", "b"] },
                email: { type: "string", format: "email" },
                n: { type: "integer", minimum: 1, maximum: 5 },
                missing: { type: "string" },
            },
        };
        const result = rv.validateResponse("errs", { id: 42, kind: "c", email: "nope", n: 10 }, schema);
        expect(result.valid).toBe(false);
        const keywords = result.errors!.map((e) => e.keyword).sort();
        expect(keywords).toContain("required");
        expect(keywords).toContain("type");
        expect(keywords).toContain("format");
        expect(keywords).toContain("enum");
        expect(keywords).toContain("maximum");
        expect(result.summary).toMatch(/validation error\(s\)/);
    });

    it("validates correctly with OpenAPI nullable:true", () => {
        const rv = new ResponseValidator();
        const schema = {
            type: "object",
            required: ["distributionDate"],
            properties: { distributionDate: { type: "string", nullable: true } },
        };
        expect(rv.validateResponse("nullable", { distributionDate: null }, schema).valid).toBe(true);
        expect(rv.validateResponse("nullable", { distributionDate: "2020-01-01" }, schema).valid).toBe(true);
    });

    it("caches compiled validators per tool name", () => {
        const rv = new ResponseValidator();
        const schema = { type: "object", properties: { id: { type: "string" } } };
        rv.validateResponse("cacheTool", { id: "1" }, schema);
        rv.validateResponse("cacheTool", { id: "1" }, schema);
        const stats = rv.getCacheStats();
        expect(stats.size).toBe(1);
        expect(stats.toolNames).toEqual(["cacheTool"]);
        rv.clearCache();
        expect(rv.getCacheStats().size).toBe(0);
    });

    it("returns a synthetic schema error when compilation fails", () => {
        const rv = new ResponseValidator();
        const bogus = { type: "object", properties: { x: { type: "not-a-type" } } };
        const result = rv.validateResponse("bogus", {}, bogus);
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]?.field).toBe("schema");
    });
});
