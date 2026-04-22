import { describe, it, expect } from "vitest";
import { buildToolDefinition } from "../../src/tool/buildToolDefinition.js";
import type { Endpoint } from "../../src/types.js";

describe("buildToolDefinition", () => {
    it("falls back to summary then to method+path for the description", () => {
        const ep: Endpoint = { method: "GET", path: "/x", parameters: [], responses: {} };
        expect(buildToolDefinition(ep).description).toBe("GET /x");

        const epSummary = { ...ep, summary: "hello" };
        expect(buildToolDefinition(epSummary).description).toBe("hello");

        const epDesc = { ...ep, summary: "hello", description: "detailed" };
        expect(buildToolDefinition(epDesc).description).toBe("detailed");
    });

    it("packages name, description, and both schemas", () => {
        const ep: Endpoint = {
            method: "GET",
            path: "/clients",
            parameters: [],
            responses: {
                "200": {
                    description: "OK",
                    content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" } } } } },
                },
            },
        };
        const tool = buildToolDefinition(ep);
        expect(tool.name).toBe("getClients");
        expect(tool.inputSchema).toBeDefined();
        expect(tool.outputSchema).toBeDefined();
    });
});
