import { describe, it, expect } from "vitest";
import { buildAjvFilter } from "../../src/filter/buildAjvFilter.js";
import type { Endpoint } from "../../src/types.js";

function endpoint(responses: Endpoint["responses"], path = "/accounts"): Endpoint {
    return { method: "GET", path, parameters: [], responses };
}

describe("buildAjvFilter", () => {
    it("returns null when the 200 response has no schema", () => {
        expect(buildAjvFilter({ endpoint: endpoint({}), backend: "mch", protocol: "mcp" })).toBeNull();
        expect(buildAjvFilter({ endpoint: endpoint({ "200": { description: "ok" } }), backend: "mch", protocol: "mcp" })).toBeNull();
    });

    it("does NOT return null on an empty-properties schema (legacy returns null here)", () => {
        // The legacy buildSchemaFilter returns null when the schema has no
        // allowed fields. The AJV builder doesn't inspect fields — AJV decides
        // at runtime — so an empty schema still produces a usable filter.
        const f = buildAjvFilter({
            endpoint: endpoint({ "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } } }),
            backend: "mch",
            protocol: "mcp",
        });
        expect(f).not.toBeNull();
        expect(f!.operation).toBe("getAccounts");
    });

    it("builds a filter with a tool-name operation key and the original schema", () => {
        const schema = {
            type: "object",
            properties: {
                id: { type: "string" },
                status: { type: "string", "x-catalog": "STATUS" },
            },
        };
        const f = buildAjvFilter({
            endpoint: endpoint(
                {
                    "200": {
                        description: "ok",
                        content: { "application/json": { schema } },
                    },
                },
                "/accounts",
            ),
            backend: "mch",
            protocol: "mcp",
            description: "auto",
        });
        expect(f).not.toBeNull();
        expect(f!.operation).toBe("getAccounts");
        // responseSchema is the original (post-deref, pre-AJV-rewrite) schema —
        // x-catalog extensions are preserved so extractCatalogMappings works.
        expect(f!.responseSchema).toBe(schema);
        expect(f!.description).toBe("auto");
        expect(f).not.toHaveProperty("allowedFields");
        expect(f).not.toHaveProperty("catalogMappings");
    });
});
