# mcp-sample

Minimal MCP server that exercises **`rbcz-digi-openapi-to-mcp-lib`** end-to-end:

- parses `docs/mch-all.yml` (an OpenAPI 3.x spec) at startup
- exposes every endpoint as an MCP tool
- speaks MCP over **Streamable HTTP** at `POST /mcp` (the SDK's
  `StreamableHTTPServerTransport`, stateless mode, `enableJsonResponse: true`
  — plain JSON responses, no SSE)
- routes tool calls through the library's `executeToolCall` orchestrator
- builds **both** response filters at startup (AJV-based and the original
  allowedFields walker) so you can switch between them — or disable
  filtering entirely — via the `MCP_FILTER` env var (no validation is wired)
- uses **axios** as the HTTP client supplied to `executeToolCall`
- targets **`rbcz-digi-mock-mch`** (defaults to `http://127.0.0.1:3000`)

## Run

```bash
# 0. (one-time) build the library this sample depends on
cd ../..
pnpm install
pnpm build

# 1. start the mock backend (separate terminal)
cd examples/mock-mch
PORT=3000 node server.cjs

# 2. install + build + start the MCP server (from examples/mcp-sample/)
cd examples/mcp-sample
pnpm install
pnpm build
pnpm start                  # default — AJV-based filter
MCP_FILTER=ajv    pnpm start  # same as default
MCP_FILTER=legacy pnpm start  # original allowedFields walker
MCP_FILTER=none   pnpm start  # no filtering, return upstream as-is
```

Pick the filter at startup with **`MCP_FILTER`**. The startup log echoes the
selected filter (`filter=ajv|legacy|none`). Any other value fails fast at
boot with an explicit error.

The sample resolves the library via `file:../..` — i.e. the lib at the repo
root. Rebuild the lib (`pnpm build` at the repo root) any time you change its
source; the sample's symlinked `node_modules` entry will pick up the new
`dist/` automatically.

The MCP endpoint defaults to `http://127.0.0.1:3001/mcp`. Configure with:

| Env var | Default | Purpose |
|---|---|---|
| `MCH_BASE_URL` | `http://127.0.0.1:3000` | Upstream backend (mock-mch) |
| `MCP_HOST` | `127.0.0.1` | MCP server bind host |
| `MCP_PORT` | `3001` | MCP server port |
| `MCP_FILTER` | `ajv` | Response filter: `ajv` / `legacy` / `none` |

A new `Server` + transport is created **per request** (stateless mode) so
request IDs cannot collide across concurrent clients.

## What the wiring looks like

`src/server.ts`:

1. `parseOpenApiSpec(yamlText)` → `Endpoint[]`.
2. For each endpoint:
   - `buildToolDefinition(endpoint)` → MCP `Tool` advertised in `tools/list`.
   - `buildAjvFilter({ endpoint, backend: "mch", protocol: "mcp" })` →
     registered in an `AjvFilterRegistry` keyed by tool name.
   - `buildSchemaFilter({ endpoint, backend: "mch", protocol: "mcp" })` →
     registered in a parallel `SchemaFilterRegistry` (the original
     allowedFields walker) so `MCP_FILTER` can flip between them at
     runtime without rebuilding.
3. On `tools/call`:
   - look up the `Endpoint` (via `ToolRegistry`) and pick the filter from
     the registry that matches `MCP_FILTER` (or `null` when `MCP_FILTER=none`).
   - hand both to `executeToolCall` along with an axios-backed
     `httpClient(plan)`. The library plans the HTTP request, calls axios,
     applies the chosen filter (`executeToolCall` discriminates between
     the two filter shapes internally), wraps arrays for MCP
     `structuredContent`, and formats the `CallToolResult`.

No catalog translations and no `ResponseValidator` are wired — filtering only,
per the task brief.

## Quick smoke test (curl)

```bash
# list tools
curl -sS -X POST http://127.0.0.1:3001/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# call a tool
curl -sS -X POST http://127.0.0.1:3001/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"getUserInfo","arguments":{"clientId":1001}}}'
```

(Tool names come from the OpenAPI `operationId` — check the `tools/list`
response for the exact names this spec generates.)

## Notes / caveats observed while testing

- **Array request bodies are wrapped under `body`.** OpenAPI bodies that are
  not `type: object` (e.g. `POST /catalogs/bulk` takes a JSON array) become an
  input field named `body` on the MCP tool, and the library currently sends
  them on the wire as `{ "body": [...] }` rather than the bare array. The
  mock-mch dispatcher therefore falls back to its `empty` fixture for such
  calls. This is library behaviour, not a sample bug.
- **`allOf`-only object schemas filter down to `{}`.** The AJV filter's
  documented limitation: combinator branches (`allOf` / `oneOf` / `anyOf`)
  are not introspected, so an object whose properties live entirely inside
  an `allOf` (e.g. `UserInfoResponse.user`) gets stripped to an empty
  object. Documented in the library README under "Known limitation". Switch
  to `MCP_FILTER=legacy` (or `none`) if you need to see what the upstream
  is actually returning for those schemas.
