import { describe, it, expect } from "vitest";
import { serializeQueryParameters } from "../../src/tool/serializeQueryParameters.js";

describe("serializeQueryParameters", () => {
    it("returns empty string for an empty record", () => {
        expect(serializeQueryParameters({})).toBe("");
    });

    it("serialises primitive values", () => {
        expect(serializeQueryParameters({ a: "1", b: 2, c: true })).toBe("a=1&b=2&c=true");
    });

    it("URL-encodes keys and values", () => {
        expect(serializeQueryParameters({ "a b": "x/y" })).toBe("a%20b=x%2Fy");
    });

    it("repeats array values by default", () => {
        expect(serializeQueryParameters({ id: ["a", "b", "c"] })).toBe("id=a&id=b&id=c");
    });

    it("joins array values with commas in csv style", () => {
        expect(serializeQueryParameters({ id: ["a", "b", "c"] }, "csv")).toBe("id=a,b,c");
    });

    it("encodes elements within csv arrays", () => {
        expect(serializeQueryParameters({ id: ["a/b", "c d"] }, "csv")).toBe("id=a%2Fb,c%20d");
    });

    it("skips undefined values", () => {
        expect(serializeQueryParameters({ a: "1", b: undefined, c: 2 })).toBe("a=1&c=2");
    });

    it("mixes primitives and arrays", () => {
        expect(serializeQueryParameters({ x: 1, ids: ["a", "b"] })).toBe("x=1&ids=a&ids=b");
    });
});