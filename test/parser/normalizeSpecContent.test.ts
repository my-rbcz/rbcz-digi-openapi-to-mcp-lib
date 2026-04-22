import { describe, it, expect } from "vitest";
import { normalizeSpecContent } from "../../src/parser/normalizeSpecContent.js";

describe("normalizeSpecContent", () => {
    it("converts CRLF and CR to LF and trims", () => {
        expect(normalizeSpecContent("  a\r\nb\rc\n  ")).toBe("a\nb\nc");
    });
});
