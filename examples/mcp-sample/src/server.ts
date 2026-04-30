import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";

import axios, { AxiosError, type AxiosInstance } from "axios";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
    AjvFilterRegistry,
    ResponseValidator,
    SchemaFilterRegistry,
    ToolRegistry,
    buildAjvFilter,
    buildSchemaFilter,
    buildToolDefinition,
    executeToolCall,
    extractCatalogMappings,
    parseOpenApiSpec,
    type CatalogMappings,
    type CodeLookup,
    type HttpResponseLike,
    type Logger,
    type ToolRequestPlan,
} from "rbcz-digi-openapi-to-mcp-lib";

const BACKEND = "mch";
const PROTOCOL = "mcp" as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(__dirname, "../docs/mch-all.yml");
const BASE_URL = process.env.MCH_BASE_URL ?? "http://127.0.0.1:3000";
const PORT = Number(process.env.MCP_PORT ?? 3001);
const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const MCP_PATH = "/mcp";

// Which response filter to apply to tool calls.
//   "ajv"    → AJV-based filter (buildAjvFilter / AjvFilterRegistry)
//   "legacy" → original allowedFields filter (buildSchemaFilter / SchemaFilterRegistry)
//   "none"   → no filtering, return the upstream payload as-is
type FilterKind = "ajv" | "legacy" | "none";
const FILTER_KIND: FilterKind = parseFilterKind(process.env.MCP_FILTER);

function parseFilterKind(value: string | undefined): FilterKind {
    if (value === undefined || value === "") return "ajv";
    if (value === "ajv" || value === "legacy" || value === "none") return value;
    throw new Error(`Invalid MCP_FILTER='${value}'. Expected one of: ajv, legacy, none.`);
}

// Minimal console-backed logger so library warnings (e.g. response-validation
// failures from executeToolCall) actually surface in this sample's output.
const logger: Logger = {
    debug: (msg: string, meta?: unknown) => console.log(`[mcp-sample][debug] ${msg}`, meta ?? ""),
    info: (msg: string, meta?: unknown) => console.log(`[mcp-sample][info]  ${msg}`, meta ?? ""),
    warn: (msg: string, meta?: unknown) => console.warn(`[mcp-sample][warn]  ${msg}`, meta ?? ""),
    error: (msg: string, meta?: unknown) => console.error(`[mcp-sample][error] ${msg}`, meta ?? ""),
};

async function main(): Promise<void> {
    const specText = await readFile(SPEC_PATH, "utf8");
    const spec = await parseOpenApiSpec(specText);

    const tools: Tool[] = [];
    const toolRegistry = new ToolRegistry();
    const ajvFilterRegistry = new AjvFilterRegistry();
    const legacyFilterRegistry = new SchemaFilterRegistry();
    const outputSchemas = new Map<string, unknown>();
    const catalogMappingsByTool = new Map<string, CatalogMappings>();
    const validator = new ResponseValidator({ logger });

    for (const endpoint of spec.endpoints) {
        const toolDef = buildToolDefinition(endpoint);
        toolRegistry.add(endpoint);
        tools.push({
            name: toolDef.name,
            description: toolDef.description,
            inputSchema: toolDef.inputSchema as Tool["inputSchema"],
            ...(toolDef.outputSchema ? { outputSchema: toolDef.outputSchema as Tool["outputSchema"] } : {}),
        });
        if (toolDef.outputSchema) outputSchemas.set(toolDef.name, toolDef.outputSchema);

        // Build BOTH filters so the active one can be flipped at runtime via MCP_FILTER.
        const ajvFilter = buildAjvFilter({ endpoint, backend: BACKEND, protocol: PROTOCOL });
        if (ajvFilter) ajvFilterRegistry.add(ajvFilter);

        const legacyFilter = buildSchemaFilter({ endpoint, backend: BACKEND, protocol: PROTOCOL });
        if (legacyFilter) legacyFilterRegistry.add(legacyFilter);

        // Precompute catalog mappings (path → catalog code) from the response
        // schema. Used at call time to translate coded values into human text.
        const responseSchema = ajvFilter?.responseSchema ?? legacyFilter?.responseSchema;
        if (responseSchema !== undefined && responseSchema !== null) {
            const mappings = extractCatalogMappings(responseSchema);
            if (Object.keys(mappings).length > 0) {
                catalogMappingsByTool.set(toolDef.name, mappings);
            }
        }
    }

    const backendAxios = axios.create({ baseURL: BASE_URL });
    const httpClient = buildAxiosHttpClient(backendAxios);
    const fetchCatalogs = buildCatalogFetcher(backendAxios);

    function createMcpServer(lang: LangKey): Server {
        const server = new Server(
            { name: "rbcz-digi-mcp-sample", version: "0.1.0" },
            { capabilities: { tools: { listChanged: false } } },
        );

        server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args = {} } = request.params;

            const endpoint = toolRegistry.get(name);
            if (!endpoint) {
                return {
                    content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
                    isError: true,
                };
            }

            const filter =
                FILTER_KIND === "ajv"
                    ? (ajvFilterRegistry.get(BACKEND, PROTOCOL, name) ?? null)
                    : FILTER_KIND === "legacy"
                      ? (legacyFilterRegistry.get(BACKEND, PROTOCOL, name) ?? null)
                      : null;

            // If the response schema references any `x-catalog`, pre-fetch
            // those catalogs and build a sync CodeLookup keyed by `lang`.
            // Failure to fetch translations is non-fatal: we log and skip,
            // returning the un-translated payload.
            let translations: { mappings: CatalogMappings; lookup: CodeLookup } | null = null;
            const mappings = catalogMappingsByTool.get(name);
            if (mappings && Object.keys(mappings).length > 0) {
                // `CatalogMappings` is `Record<string, string>`. The cast keeps
                // `codes` typed as `string[]` even when the lib's type
                // declarations are missing (in which case `Object.values()`
                // would otherwise widen to `unknown[]`).
                const codes: string[] = Array.from(new Set(Object.values(mappings) as string[]));
                try {
                    const catalogs = await fetchCatalogs(codes);
                    translations = { mappings, lookup: buildCodeLookup(catalogs, lang) };
                } catch (err) {
                    logger.warn(`Catalog fetch failed for tool ${name}; returning untranslated payload`, {
                        codes,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }

            const result = await executeToolCall({
                endpoint,
                args: args as Record<string, unknown>,
                httpClient,
                filter,
                translations,
                validator,
                outputSchema: outputSchemas.get(name),
                logger,
            });
            return result as unknown as Record<string, unknown>;
        });

        return server;
    }

    const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

        if (url.pathname !== MCP_PATH) {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("Not found. MCP endpoint is " + MCP_PATH);
            return;
        }

        // Stateless mode: new Server + transport per request to avoid request-id collisions.
        // Capture Accept-Language off the underlying HTTP request so each tool
        // call can translate catalog values into the caller's preferred language.
        const lang = pickAcceptLanguage(req.headers["accept-language"]);
        const server = createMcpServer(lang);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true, // DO NOT use SSE response!
        });

        res.on("close", () => {
            transport.close().catch(() => {});
            server.close().catch(() => {});
        });

        try {
            await server.connect(transport);
            await transport.handleRequest(req, res);
        } catch (err) {
            console.error("[rbcz-digi-mcp-sample] request error:", err);
            if (!res.headersSent) {
                res.writeHead(500, { "content-type": "application/json" });
                res.end(
                    JSON.stringify({
                        jsonrpc: "2.0",
                        error: { code: -32603, message: "Internal error" },
                        id: null,
                    }),
                );
            }
        }
    });

    httpServer.listen(PORT, HOST, () => {
        console.error(
            `[rbcz-digi-mcp-sample] listening on http://${HOST}:${PORT}${MCP_PATH} — ${tools.length} tool(s) loaded, backend=${BASE_URL}, filter=${FILTER_KIND}`,
        );
    });
}

function buildAxiosHttpClient(instance: AxiosInstance): (plan: ToolRequestPlan) => Promise<HttpResponseLike> {
    return async (plan) => {
        try {
            const response = await instance.request({
                method: plan.method,
                url: plan.path,
                params: plan.query,
                data: plan.body,
                headers: plan.headers,
            });
            return { status: response.status, data: response.data };
        } catch (err) {
            if (err instanceof AxiosError && err.response) {
                throw {
                    response: {
                        status: err.response.status,
                        statusText: err.response.statusText,
                        data: err.response.data,
                    },
                };
            }
            throw err;
        }
    };
}

// =============================================================================
// Translations: catalog fetch + Accept-Language → CodeLookup
// =============================================================================
// `executeToolCall` accepts `translations: { mappings, lookup }` where:
//   - `mappings` is `{ "<dot.path>": "<catalogCode>", ... }` derived from
//     `x-catalog` markers in the response schema (computed at startup).
//   - `lookup` is a SYNCHRONOUS `(catalogCode, value) => string`.
//
// Because `lookup` is sync and the catalog data lives behind an HTTP API
// (`POST /catalogs/bulk`), we pre-fetch every catalog needed for the current
// tool call BEFORE invoking `executeToolCall`, then close over the result.
// No caching — each tool call fetches afresh, which is fine for an example.
// =============================================================================

type LangKey = "cz" | "en";

interface CatalogValue {
    code: string;
    texts?: Record<string, string>;
}

interface CatalogPayload {
    catalogCode: string;
    values?: Record<string, CatalogValue>;
}

function buildCatalogFetcher(instance: AxiosInstance): (codes: string[]) => Promise<CatalogPayload[]> {
    return async (codes) => {
        if (codes.length === 0) return [];
        const body = codes.map((catalogCode) => ({ catalogCode }));
        const response = await instance.post<CatalogPayload[]>("/catalogs/bulk", body, {
            headers: { "Content-Type": "application/json" },
        });
        return Array.isArray(response.data) ? response.data : [];
    };
}

/**
 * Pick a supported text key off the incoming HTTP `Accept-Language` header.
 * Defaults to "en". The mock catalog texts are keyed by "cz" / "en", so this
 * also maps the proper ISO tag "cs" onto "cz".
 */
function pickAcceptLanguage(rawHeader: string | string[] | undefined): LangKey {
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!header) return "en";
    const first = header.split(",")[0]?.trim().toLowerCase();
    if (!first) return "en";
    const primary = first.split("-")[0];
    if (primary === "cz" || primary === "cs") return "cz";
    return "en";
}

/**
 * Turn a bulk-catalog payload into a synchronous `CodeLookup`.
 *
 * Input — `catalogs` (verbatim shape as returned by `POST /catalogs/bulk`,
 * one entry per requested catalog code; this is the same JSON the mock
 * server in `examples/mock-mch/fixtures/catalogs-bulk/` produces):
 *
 *   [
 *     {
 *       "catalogCode": "COUNTRIES",
 *       "values": {
 *         "CZ": { "code": "CZ", "texts": { "cz": "Ceska republika", "en": "Czech Republic" } },
 *         "SK": { "code": "SK", "texts": { "cz": "Slovensko",       "en": "Slovakia" } },
 *         "DE": { "code": "DE", "texts": { "cz": "Nemecko",         "en": "Germany" } }
 *       }
 *     },
 *     {
 *       "catalogCode": "CURRENCIES",
 *       "values": {
 *         "CZK": { "code": "CZK", "texts": { "cz": "Ceska koruna",   "en": "Czech koruna" } },
 *         "EUR": { "code": "EUR", "texts": { "cz": "Euro",           "en": "Euro" } },
 *         "USD": { "code": "USD", "texts": { "cz": "Americky dolar", "en": "US Dollar" } }
 *       }
 *     },
 *     {
 *       "catalogCode": "DebitCardStatus",
 *       "values": {
 *         "ACTIVE":  { "code": "ACTIVE",  "texts": { "cz": "Aktivni",   "en": "Active" } },
 *         "BLOCKED": { "code": "BLOCKED", "texts": { "cz": "Blokovana", "en": "Blocked" } }
 *       }
 *     }
 *   ]
 *
 * Input — `lang`: `"cz"` or `"en"` (which key inside `texts` to read).
 *
 * Output — `CodeLookup`, i.e. `(catalogName, value) => string`. With the
 * sample payload above and `lang = "en"`:
 *   lookup("COUNTRIES",       "CZ")     → "Czech Republic"
 *   lookup("CURRENCIES",      "CZK")    → "Czech koruna"
 *   lookup("DebitCardStatus", "ACTIVE") → "Active"
 *   lookup("COUNTRIES",       "XX")     → "XX"     // unknown value:   pass through
 *   lookup("UNKNOWN",         "CZ")     → "CZ"     // unknown catalog: pass through
 *
 * Same payload with `lang = "cz"`:
 *   lookup("COUNTRIES",       "CZ")     → "Ceska republika"
 *   lookup("CURRENCIES",      "EUR")    → "Euro"
 *   lookup("DebitCardStatus", "BLOCKED") → "Blokovana"
 *
 * Per-entry text resolution: `texts[lang]` → `texts.en` → `entry.code`.
 */
function buildCodeLookup(catalogs: CatalogPayload[], lang: LangKey): CodeLookup {
    const byCatalog = new Map<string, Map<string, string>>();
    for (const cat of catalogs) {
        if (!cat || typeof cat.catalogCode !== "string" || !cat.values) continue;
        const valueMap = new Map<string, string>();
        for (const [code, entry] of Object.entries(cat.values)) {
            const text = entry?.texts?.[lang] ?? entry?.texts?.en ?? entry?.code;
            if (typeof text === "string") valueMap.set(code, text);
        }
        byCatalog.set(cat.catalogCode, valueMap);
    }
    return (catalogName: string, value: string | number) => {
        const key = String(value);
        return byCatalog.get(catalogName)?.get(key) ?? key;
    };
}

main().catch((err) => {
    console.error("[rbcz-digi-mcp-sample] fatal:", err);
    process.exit(1);
});
