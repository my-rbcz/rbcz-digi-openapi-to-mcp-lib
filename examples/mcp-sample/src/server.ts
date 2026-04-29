import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";

import axios, { AxiosError } from "axios";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
    AjvFilterRegistry,
    SchemaFilterRegistry,
    ToolRegistry,
    buildAjvFilter,
    buildSchemaFilter,
    buildToolDefinition,
    executeToolCall,
    parseOpenApiSpec,
    type HttpResponseLike,
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

async function main(): Promise<void> {
    const specText = await readFile(SPEC_PATH, "utf8");
    const spec = await parseOpenApiSpec(specText);

    const tools: Tool[] = [];
    const toolRegistry = new ToolRegistry();
    const ajvFilterRegistry = new AjvFilterRegistry();
    const legacyFilterRegistry = new SchemaFilterRegistry();

    for (const endpoint of spec.endpoints) {
        const toolDef = buildToolDefinition(endpoint);
        toolRegistry.add(endpoint);
        tools.push({
            name: toolDef.name,
            description: toolDef.description,
            inputSchema: toolDef.inputSchema as Tool["inputSchema"],
            ...(toolDef.outputSchema ? { outputSchema: toolDef.outputSchema as Tool["outputSchema"] } : {}),
        });

        // Build BOTH filters so the active one can be flipped at runtime via MCP_FILTER.
        const ajvFilter = buildAjvFilter({ endpoint, backend: BACKEND, protocol: PROTOCOL });
        if (ajvFilter) ajvFilterRegistry.add(ajvFilter);

        const legacyFilter = buildSchemaFilter({ endpoint, backend: BACKEND, protocol: PROTOCOL });
        if (legacyFilter) legacyFilterRegistry.add(legacyFilter);
    }

    const httpClient = buildAxiosHttpClient(BASE_URL);

    function createMcpServer(): Server {
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

            const result = await executeToolCall({
                endpoint,
                args: args as Record<string, unknown>,
                httpClient,
                filter,
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
        const server = createMcpServer();
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

function buildAxiosHttpClient(baseUrl: string): (plan: ToolRequestPlan) => Promise<HttpResponseLike> {
    const instance = axios.create({ baseURL: baseUrl });
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

main().catch((err) => {
    console.error("[rbcz-digi-mcp-sample] fatal:", err);
    process.exit(1);
});
