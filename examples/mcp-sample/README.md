# rbcz-digi-mcp-sample

Minimal MCP server that exercises **`rbcz-digi-openapi-to-mcp-lib`** end-to-end:

- parses `docs/mch-all.yml` (an OpenAPI 3.x spec) at startup
- exposes every endpoint as an MCP tool over **stdio**
- routes tool calls through the library's `executeToolCall` orchestrator
- uses the **AJV-based** response filter (`buildAjvFilter` / `AjvFilterRegistry`) — no validation
- uses **axios** as the HTTP client supplied to `executeToolCall`
- targets **`rbcz-digi-mock-mch`** (defaults to `http://127.0.0.1:3000`)

The goal is to confirm the library wires together as documented.

## Run

```bash
# 0. (one-time) build the library this sample depends on
cd ../..
pnpm install
pnpm build

# 1. start the mock backend (separate terminal)
cd examples/mock-mch
PORT=3000 node server.js

# 2. install + build + start the MCP server (from examples/mcp-sample/)
cd examples/mcp-sample
pnpm install
pnpm build
pnpm start
```

The sample resolves the library via `file:../..` — i.e. the lib at the repo
root. Rebuild the lib (`pnpm build` at the repo root) any time you change its
source; the sample's symlinked `node_modules` entry will pick up the new
`dist/` automatically.

The server speaks MCP over stdio (JSON-RPC 2.0, newline-delimited). Override the
backend with `MCH_BASE_URL=http://host:port pnpm start`.

## What the wiring looks like

`src/server.ts`:

1. `parseOpenApiSpec(yamlText)` → `Endpoint[]`.
2. For each endpoint:
   - `buildToolDefinition(endpoint)` → MCP `Tool` advertised in `tools/list`.
   - `buildAjvFilter({ endpoint, backend: "mch", protocol: "mcp" })` →
     registered in an `AjvFilterRegistry` keyed by tool name.
3. On `tools/call`:
   - look up the `Endpoint` (via `ToolRegistry`) and the AJV filter.
   - hand both to `executeToolCall` along with an axios-backed
     `httpClient(plan)`. The library plans the HTTP request, calls axios,
     applies the AJV filter, wraps arrays for MCP `structuredContent`, and
     formats the `CallToolResult`.

No catalog translations and no `ResponseValidator` are wired — filtering only,
per the task brief.

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
  object. Documented in the library README under "Known limitation".