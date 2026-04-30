# mock-mch

Tiny HTTP backend that pretends to be MCH. Used as the upstream for
[`../mcp-sample/`](../mcp-sample); also runnable on its own with `curl`.

- Single file (`server.cjs`), pure Node — **no dependencies**, no
  `package.json`, no build step.
- Each route returns a JSON fixture loaded from `fixtures/<route>/<name>.json`.
- Which fixture is returned is decided by the **request inputs** (path, query,
  body) — there are no special mock headers or override params.

## Run

```bash
node server.cjs                      # http://127.0.0.1:3000
PORT=4000 HOST=0.0.0.0 node server.cjs
```

On startup the server prints every route and the fixtures available for it.

## Routes and fixture dispatch

| Route | Dispatch input | Fixtures |
|---|---|---|
| `GET /clients` | (none — always the same) | `clients/default.json` |
| `GET /user/info?clientId=<N>` | `clientId`: `1001` / `2001` / `3001` | `user-info/default.json` / `minimal.json` / `non-client.json` |
| `GET /contacts?clientId=<N>` | `clientId`: `1001` / `2001` / `3001` | `contacts/default.json` / `minimal.json` / `empty.json` |
| `POST /catalogs/bulk` | every `catalogCode` in body | one fixture per code under `catalogs-bulk/<CODE>.json`, response composed |

Any unrecognised `clientId` on `/user/info` or `/contacts` returns 404. The
authoritative dispatch table lives at the top of `server.cjs` — keep that
comment in sync if you add fixtures or routes.

`/catalogs/bulk` is special: it does not pick one fixture, it concatenates
one fixture per requested `catalogCode`. The available codes are derived
from `x-catalog` markers in `docs/mch-all.yml`; add a new
`catalogs-bulk/<CODE>.json` to support a new code. Unknown codes are
returned with empty `values`.

## Layout

```
server.cjs              # the whole server
fixtures/
  clients/             one fixture
  user-info/           three fixtures, picked by clientId
  contacts/            three fixtures, picked by clientId
  catalogs-bulk/       one fixture per catalogCode; response composed from body
docs/mch-all.yml       OpenAPI spec these routes correspond to
```

The OpenAPI spec under `docs/` is what `../mcp-sample/` parses to expose
these routes as MCP tools. If you change a fixture's shape, update the spec
(or the spec the sample loads) so the AJV-based filter doesn't strip your
new fields.
