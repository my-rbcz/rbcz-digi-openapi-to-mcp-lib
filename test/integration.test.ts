import { describe, it, expect } from "vitest";
import { parseOpenApiSpec } from "../src/parser/parseOpenApiSpec.js";
import { buildToolDefinition } from "../src/tool/buildToolDefinition.js";
import { buildSchemaFilter } from "../src/filter/buildSchemaFilter.js";
import { applyFilter } from "../src/filter/applyFilter.js";
import { applyTranslations } from "../src/filter/applyTranslations.js";
import { ResponseValidator } from "../src/validation/ResponseValidator.js";
import { extractCatalogNames } from "../src/catalog/extractCatalogNames.js";
import { extractCatalogMappings } from "../src/catalog/extractCatalogMappings.js";
import { ToolRegistry } from "../src/tool/ToolRegistry.js";
import { executeToolCall } from "../src/tool/executeToolCall.js";
import { loadFixture } from "./fixtures/loadFixture.js";

describe("end-to-end pipeline", () => {
    it("parses, generates tools, filters, translates, and validates", async () => {
        const spec = await parseOpenApiSpec(loadFixture("nested-catalogs.yml"));
        expect(spec.endpoints).toHaveLength(1);

        const endpoint = spec.endpoints[0]!;
        const tool = buildToolDefinition(endpoint);
        expect(tool.name).toBe("getAccountsAccountId");

        const filter = buildSchemaFilter({ endpoint, backend: "mch", protocol: "mcp" });
        expect(filter).not.toBeNull();

        const catalogMappings = extractCatalogMappings(filter!.responseSchema);
        expect(catalogMappings).toEqual({ "currencyFolders.status": "CURRENCYFOLDERSTATUS" });

        const rawResponse = {
            status: "1",
            currencyFolders: {
                CZK: { status: "1", balance: 100, junk: true },
                USD: { status: "2", balance: 5 },
            },
            shouldBeStripped: "x",
        };
        const filtered = applyFilter(rawResponse, filter!) as any;
        expect(filtered.shouldBeStripped).toBeUndefined();
        expect(filtered.currencyFolders.CZK.junk).toBeUndefined();

        const translated = applyTranslations(filtered, catalogMappings, (catalog, v) => `${catalog}#${v}`) as any;
        // root status has no mapping → untouched
        expect(translated.status).toBe("1");
        // nested statuses get translated via parent-path fallback
        expect(translated.currencyFolders.CZK.status).toBe("CURRENCYFOLDERSTATUS#1");
        expect(translated.currencyFolders.USD.status).toBe("CURRENCYFOLDERSTATUS#2");

        const rv = new ResponseValidator();
        const result = rv.validateResponse(tool.name, translated, tool.outputSchema);
        expect(result.valid).toBe(true);
    });

    it("collects catalog names from the full dereferenced document", async () => {
        const spec = await parseOpenApiSpec(loadFixture("nullable-and-x-attrs.yml"));
        expect(extractCatalogNames(spec.fullDocument)).toEqual(["DebitCardType"]);
    });

    it("end-to-end: registry → plan → fake fetch → filter → translate → format", async () => {
        const spec = await parseOpenApiSpec(loadFixture("nested-catalogs.yml"));
        const endpoint = spec.endpoints[0]!;
        const tool = buildToolDefinition(endpoint);

        const registry = new ToolRegistry();
        registry.add(endpoint);
        expect(registry.has(tool.name)).toBe(true);

        const filter = buildSchemaFilter({ endpoint, backend: "mch", protocol: "mcp" })!;
        const mappings = extractCatalogMappings(filter.responseSchema);

        const captured: { path?: string; method?: string } = {};
        const httpClient = async (plan: { method: string; path: string }) => {
            captured.path = plan.path;
            captured.method = plan.method;
            return {
                status: 200,
                data: {
                    status: "1",
                    currencyFolders: {
                        CZK: { status: "1", balance: 100, junk: true },
                    },
                    shouldBeStripped: "x",
                },
            };
        };

        const result = await executeToolCall({
            endpoint: registry.get(tool.name)!,
            args: { accountId: "abc-123" },
            httpClient,
            filter,
            translations: { mappings, lookup: (cat, v) => `${cat}#${v}` },
            validator: new ResponseValidator(),
            outputSchema: tool.outputSchema,
        });

        expect(captured.method).toBe("GET");
        expect(captured.path).toBe("/accounts/abc-123");
        expect(result.isError).toBeUndefined();
        const sc = result.structuredContent as Record<string, unknown>;
        expect(sc.shouldBeStripped).toBeUndefined();
        const folders = sc.currencyFolders as Record<string, Record<string, unknown>>;
        expect(folders.CZK?.junk).toBeUndefined();
        expect(folders.CZK?.status).toBe("CURRENCYFOLDERSTATUS#1");
        expect(sc.status).toBe("1");
    });
});
