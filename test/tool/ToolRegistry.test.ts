import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../src/tool/ToolRegistry.js";
import type { Endpoint } from "../../src/types.js";

const ep1: Endpoint = { method: "GET", path: "/clients", parameters: [], responses: {} };
const ep2: Endpoint = {
    method: "POST",
    path: "/accounts/{accountId}/transactions",
    parameters: [{ name: "accountId", in: "path", required: true, schema: {} }],
    responses: {},
};

describe("ToolRegistry", () => {
    it("adds endpoints keyed by generated tool name", () => {
        const r = new ToolRegistry();
        const n1 = r.add(ep1);
        const n2 = r.add(ep2);
        expect(n1).toBe("getClients");
        expect(n2).toBe("postAccountsAccountIdTransactions");
        expect(r.size()).toBe(2);
    });

    it("has() and get() work for known tools", () => {
        const r = new ToolRegistry();
        r.add(ep1);
        expect(r.has("getClients")).toBe(true);
        expect(r.has("nope")).toBe(false);
        expect(r.get("getClients")).toBe(ep1);
        expect(r.get("nope")).toBeUndefined();
    });

    it("all() returns the registered endpoints", () => {
        const r = new ToolRegistry();
        r.add(ep1);
        r.add(ep2);
        expect(r.all()).toHaveLength(2);
        expect(r.all()).toContain(ep1);
        expect(r.all()).toContain(ep2);
    });

    it("clear() empties the registry", () => {
        const r = new ToolRegistry();
        r.add(ep1);
        r.clear();
        expect(r.size()).toBe(0);
        expect(r.has("getClients")).toBe(false);
    });

    it("re-adding an endpoint with the same name overwrites the previous entry", () => {
        const r = new ToolRegistry();
        r.add(ep1);
        const replacement: Endpoint = { ...ep1, summary: "v2" };
        r.add(replacement);
        expect(r.size()).toBe(1);
        expect(r.get("getClients")).toBe(replacement);
    });
});