import { describe, it, expect } from "vitest";
import { wrapArrayForStructuredContent } from "../../src/tool/wrapArrayForStructuredContent.js";
import { generateArrayWrapperKey } from "../../src/tool/generateArrayWrapperKey.js";

describe("wrapArrayForStructuredContent", () => {
    it("wraps arrays under the derived key", () => {
        const out = wrapArrayForStructuredContent("getClients", [{ id: "1" }]);
        expect(out).toEqual({ clients: [{ id: "1" }] });
        expect(Object.keys(out)).toEqual([generateArrayWrapperKey("getClients")]);
    });

    it("wraps primitives under 'value'", () => {
        expect(wrapArrayForStructuredContent("getX", 7)).toEqual({ value: 7 });
        expect(wrapArrayForStructuredContent("getX", "ok")).toEqual({ value: "ok" });
        expect(wrapArrayForStructuredContent("getX", true)).toEqual({ value: true });
    });

    it("wraps null under 'value'", () => {
        expect(wrapArrayForStructuredContent("getX", null)).toEqual({ value: null });
    });

    it("passes objects through untouched", () => {
        const obj = { a: 1, b: 2 };
        expect(wrapArrayForStructuredContent("getX", obj)).toBe(obj);
    });

    it("uses the same wrapper key as generateArrayWrapperKey for parity", () => {
        const toolName = "postDebitcardsTransactions";
        const out = wrapArrayForStructuredContent(toolName, []);
        expect(out).toEqual({ [generateArrayWrapperKey(toolName)]: [] });
    });
});