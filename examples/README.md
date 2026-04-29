# Examples

Two standalone Node packages that demonstrate how to use
`rbcz-digi-openapi-to-mcp-lib` end-to-end. They are **not part of the
library's published surface** (excluded from the tarball by `files: ["dist"]`
in the root `package.json`) — they exist purely to show wiring.

| Folder | What it is |
|---|---|
| [`mock-mch/`](./mock-mch) | Tiny HTTP backend that pretends to be MCH. Pure Node, zero dependencies, fixture-per-route dispatch. Used as the upstream that the MCP sample calls. |
| [`mcp-sample/`](./mcp-sample) | MCP server (Streamable HTTP transport, JSON responses) that parses an OpenAPI spec at startup and turns every endpoint into an MCP tool via this library. Uses axios as the HTTP client and the AJV-based response filter. Defaults to `http://127.0.0.1:3001/mcp`. |

## How they fit together

```
MCP client (Claude / inspector / etc.)
        │  HTTP POST /mcp  (Streamable HTTP, JSON-RPC 2.0)
        ▼
   mcp-sample          ──▶ rbcz-digi-openapi-to-mcp-lib
   (axios + lib)               (parse → tool defs → filter → exec)
        │  HTTP
        ▼
    mock-mch
   (fixtures/*.json)
```

`mcp-sample` uses the MCP SDK's `StreamableHTTPServerTransport` in stateless
mode with `enableJsonResponse: true` (no SSE) — every request gets a fresh
server + transport so request IDs can't collide.

`mcp-sample` depends on the library via `"rbcz-digi-openapi-to-mcp-lib":
"file:../.."`, so any change under `src/` requires a `pnpm build` at the
repo root before the sample picks it up.

## Quick start

```bash
# from repo root — build the library the sample consumes
pnpm install && pnpm build

# terminal 1 — start the mock backend
cd examples/mock-mch
PORT=3000 node server.cjs

# terminal 2 — build and run the MCP server
cd examples/mcp-sample
pnpm install && pnpm build && pnpm start
```

See each subfolder's `README.md` for fixture-trigger details (`mock-mch`)
and the wiring walkthrough plus known caveats (`mcp-sample`).