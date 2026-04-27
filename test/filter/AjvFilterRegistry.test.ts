import { describe, it, expect } from "vitest";
import { AjvFilterRegistry } from "../../src/filter/AjvFilterRegistry.js";
import type { AjvFilterDefinition } from "../../src/types.js";

const baseFilter: AjvFilterDefinition = {
    backend: "mch",
    protocol: "mcp",
    operation: "getX",
    responseSchema: {},
};

describe("AjvFilterRegistry", () => {
    it("add/get/has/all/size/clear follow the key format", () => {
        const reg = new AjvFilterRegistry();
        reg.add(baseFilter);
        expect(reg.size()).toBe(1);
        expect(reg.has("mch", "mcp", "getX")).toBe(true);
        expect(reg.get("mch", "mcp", "getX")).toBe(baseFilter);
        expect(reg.all()).toEqual([baseFilter]);

        reg.clear();
        expect(reg.size()).toBe(0);
        expect(reg.get("mch", "mcp", "getX")).toBeUndefined();
    });

    it("distinguishes filters by protocol and backend", () => {
        const reg = new AjvFilterRegistry();
        reg.add(baseFilter);
        reg.add({ ...baseFilter, protocol: "rest" });
        reg.add({ ...baseFilter, backend: "baman" });
        expect(reg.size()).toBe(3);
    });
});
