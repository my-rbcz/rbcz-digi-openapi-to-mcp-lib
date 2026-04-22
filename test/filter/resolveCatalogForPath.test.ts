import { describe, it, expect } from "vitest";
import { resolveCatalogForPath } from "../../src/filter/resolveCatalogForPath.js";

describe("resolveCatalogForPath", () => {
    it("prefers exact path matches", () => {
        const mappings = { "a.b": "EXACT", b: "PLAIN" };
        expect(resolveCatalogForPath(mappings, "a", "b")).toBe("EXACT");
    });

    it("falls back to parent-path shortening", () => {
        const mappings = { "outer.inner": "DEEP" };
        expect(resolveCatalogForPath(mappings, "outer.mid", "inner")).toBe("DEEP");
    });

    it("finally falls back to the bare field name", () => {
        const mappings = { status: "STATUS" };
        expect(resolveCatalogForPath(mappings, "anything", "status")).toBe("STATUS");
    });

    it("returns undefined when nothing matches", () => {
        expect(resolveCatalogForPath({ other: "x" }, "path", "field")).toBeUndefined();
    });
});
