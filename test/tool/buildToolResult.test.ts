import { describe, it, expect } from "vitest";
import { buildToolResult } from "../../src/tool/buildToolResult.js";

describe("buildToolResult", () => {
    it("returns the MCP CallToolResult shape", () => {
        const data = { foo: "bar", n: 1 };
        const result = buildToolResult(data);
        expect(result.structuredContent).toBe(data);
        expect(result.content).toHaveLength(1);
        expect(result.content[0]?.type).toBe("text");
        expect(result.isError).toBeUndefined();
    });

    it("JSON-stringifies the payload into content[0].text", () => {
        const data = { a: 1, b: [2, 3], c: { d: "e" } };
        const result = buildToolResult(data);
        expect(result.content[0]?.text).toBe(JSON.stringify(data));
    });

    it("round-trips through JSON.parse", () => {
        const data = { a: 1 };
        const result = buildToolResult(data);
        expect(JSON.parse(result.content[0]!.text)).toEqual(data);
    });

    it("supports empty objects", () => {
        const result = buildToolResult({});
        expect(result.content[0]?.text).toBe("{}");
        expect(result.structuredContent).toEqual({});
    });
});