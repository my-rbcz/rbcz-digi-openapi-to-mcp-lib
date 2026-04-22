import { describe, it, expect } from "vitest";
import { parseOpenApiSpec } from "../src/parser/parseOpenApiSpec.js";
import { buildToolDefinition } from "../src/tool/buildToolDefinition.js";
import { buildSchemaFilter } from "../src/filter/buildSchemaFilter.js";
import { applyFilter } from "../src/filter/applyFilter.js";
import { applyTranslations } from "../src/filter/applyTranslations.js";
import { ResponseValidator } from "../src/validation/ResponseValidator.js";
import { extractCatalogNames } from "../src/catalog/extractCatalogNames.js";
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
        expect(filter!.catalogMappings).toEqual({ "currencyFolders.status": "CURRENCYFOLDERSTATUS" });

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

        const translated = applyTranslations(filtered, filter!.catalogMappings, (catalog, v) => `${catalog}#${v}`) as any;
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
});
