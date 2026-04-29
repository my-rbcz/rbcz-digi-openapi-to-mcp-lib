# bruno-collection

Exported [Bruno](https://www.usebruno.com/) collection for poking at the
example servers in this folder. `mcp-sample.json` is a single-file export
that you can re-import into Bruno (`File → Import Collection`) — there are
no environments, every request hard-codes its host and port.

## What's covered

The collection has two groups of requests:

1. **Direct calls to the mock backend** (`mock-mch`) on
   `http://localhost:3000` — useful for sanity-checking fixtures without
   going through MCP.
2. **MCP requests against `mcp-sample`** on `http://127.0.0.1:3001/mcp`
   (Streamable HTTP, JSON-RPC 2.0). Run them in the order below for a
   full handshake → list → call flow.

Both servers must be running first (see [`../README.md`](../README.md)).

## curl equivalents

Each `curl` below is the literal equivalent of the corresponding `.bru`
request in the collection.

### Direct mock-mch (port 3000)

```bash
# clients.bru — GET /clients (no inputs, always returns the same fixture)
curl -sS http://localhost:3000/clients

# user-info.bru — GET /user/info?clientId=1001
curl -sS 'http://localhost:3000/user/info?clientId=1001'

# contacts.bru — GET /contacts?clientId=1001&withClientContacts=true&withUserContacts=true
curl -sS 'http://localhost:3000/contacts?clientId=1001&withClientContacts=true&withUserContacts=true'
```

Swap `clientId` for `2001` or `3001` to hit the other fixtures
(see [`../mock-mch/README.md`](../mock-mch/README.md)).

### MCP server (port 3001) — handshake

```bash
# mcp-initialize.bru
curl -sS -X POST http://127.0.0.1:3001/mcp \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# mcp-send-notifs.bru — initialized notification (no id, no response body)
curl -sS -X POST http://127.0.0.1:3001/mcp \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
```

`mcp-sample` runs the SDK transport in stateless mode (a fresh server +
transport per HTTP request), so the handshake isn't strictly required to
get a response from `tools/list` or `tools/call` — but the collection
includes it so the flow matches a normal MCP client.

### MCP server (port 3001) — tools/list

```bash
# mcp-list.bru
curl -sS -X POST http://127.0.0.1:3001/mcp \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### MCP server (port 3001) — tools/call

```bash
# mcp-execute-getClients.bru
curl -sS -X POST http://127.0.0.1:3001/mcp \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"getClients","arguments":{}}}'

# mcp-execute-userInfo.bru
curl -sS -X POST http://127.0.0.1:3001/mcp \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"getUserInfo","arguments":{"clientId":1001}}}'

# mcp-execute-contacts.bru
curl -sS -X POST http://127.0.0.1:3001/mcp \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"getContacts","arguments":{"clientId":1001,"withClientContacts":true,"withUserContacts":true}}}'
```

The exact tool names (`getClients`, `getUserInfo`, `getContacts`) come from
the OpenAPI `operationId` in `../mcp-sample/docs/mch-all.yml` — if you swap
in a different spec, run `tools/list` first to discover the names this
build exposes.

## Notes

- The collection has no request for `POST /catalogs/bulk` (neither direct
  nor via MCP). The library currently wraps non-object request bodies under
  a `body` field, which makes that endpoint awkward to drive end-to-end —
  see the caveat in [`../mcp-sample/README.md`](../mcp-sample/README.md).
- `id` values in the JSON-RPC payloads are arbitrary — Bruno reuses `3`
  across the `tools/call` requests and that's fine because each HTTP
  request is its own stateless session.