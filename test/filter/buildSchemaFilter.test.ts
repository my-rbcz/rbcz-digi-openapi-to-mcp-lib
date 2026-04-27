import { describe, it, expect } from "vitest";
import { buildSchemaFilter } from "../../src/filter/buildSchemaFilter.js";
import type { Endpoint } from "../../src/types.js";

function endpoint(responses: Endpoint["responses"], path = "/accounts"): Endpoint {
    return { method: "GET", path, parameters: [], responses };
}

describe("buildSchemaFilter", () => {
    it("returns null when the 200 response has no schema", () => {
        expect(buildSchemaFilter({ endpoint: endpoint({}), backend: "mch", protocol: "mcp" })).toBeNull();
        expect(buildSchemaFilter({ endpoint: endpoint({ "200": { description: "ok" } }), backend: "mch", protocol: "mcp" })).toBeNull();
    });

    it("returns null when the schema yields no allowed fields", () => {
        const filter = buildSchemaFilter({
            endpoint: endpoint({ "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } } }),
            backend: "mch",
            protocol: "mcp",
        });
        expect(filter).toBeNull();
    });

    it("builds a filter with allowedFields and a tool-name operation", () => {
        const filter = buildSchemaFilter({
            endpoint: endpoint(
                {
                    "200": {
                        description: "ok",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                        status: { type: "string", "x-catalog": "STATUS" },
                                    },
                                },
                            },
                        },
                    },
                },
                "/accounts"
            ),
            backend: "mch",
            protocol: "mcp",
            description: "auto",
        });
        expect(filter).not.toBeNull();
        expect(filter!.operation).toBe("getAccounts");
        expect(filter!.allowedFields.sort()).toEqual(["id", "status"]);
        expect(filter!.description).toBe("auto");
        expect(filter).not.toHaveProperty("catalogMappings");
    });
});
