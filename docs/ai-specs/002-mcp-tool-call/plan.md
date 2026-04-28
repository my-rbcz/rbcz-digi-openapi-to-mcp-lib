# Implementation plan — MCP tool-call primitives

See `instructions.md` for the trigger. This plan turns the monolithic
`ToolsManager.callTool` + `buildRequest` pair from
`rbcz-digi-mcp-bridge` (`src/functions/endpointHandlers/mcpProtocol/services/ToolsManager.ts`)
into a set of small, pure helpers in `rbcz-digi-openapi-to-mcp-lib` so each
slice of the pipeline is independently testable and the cyclomatic complexity
of any one function stays low.

## Goal

Add a **tool-execution layer** to the library that, given an `Endpoint` and
the user-supplied tool arguments, can:

1. resolve a tool by name back to its `Endpoint`,
2. plan the outbound HTTP request (method, URL, query, headers, body),
3. shape the backend response into an MCP `CallToolResult` (filter →
   translate → wrap-array → validate → format),
4. format failures as an MCP error `CallToolResult` (`isError: true`).

The library does **not** perform any HTTP I/O. The caller still owns the HTTP
client, the backend base URLs, the auth/token exchange, the catalog loading,
and the timeout / size-limit / TLS knobs. We expose primitives the caller
can compose, plus one optional thin orchestrator that wires the primitives
together against a caller-supplied `fetch`-like function.

This mirrors the boundary already drawn in CLAUDE.md / README:
"A pure, I/O-free TypeScript library that turns an OpenAPI 3.x spec into the
primitives needed to back an MCP server. It does **not** run an MCP server,
do HTTP, touch S3, or cache anything." We do not move that boundary.

## Out of scope (kept on caller side)

- HTTP execution (axios, fetch, https.Agent, TLS, paramsSerializer).
- Backend configuration: `baseUrl`, `apiId`, `timeout`, `maxResponseSize`,
  `useSimpleAuth`. The caller composes the final URL by concatenating its
  base URL with the planned path; the caller adds `x-apigw-api-id` etc.
- MCP-token → JWT exchange (`TokenManager`).
- Code-list catalog loading (`CodeListManager.loadCatalogs`). We already
  expose `extractCatalogMappings` + `applyTranslations` and the caller
  supplies the `CodeLookup` function — that contract is unchanged.
- S3 spec loading. `parseOpenApiSpec` already takes content, not a key.

## Pipeline (what we are building)

```
            ┌─ resolveTool(name)               (lib: ToolRegistry)
            │
toolName ───┤
toolArgs    │
headers     │
            ▼
       splitToolArguments        (lib: split by parameter.in + leftovers → body)
            │
            ▼
       planToolRequest           (lib: path subst + query + body + forwarded headers)
            │
            ▼
   ┌────  caller's HTTP client  ────┐     ← OUT OF SCOPE
   │  axios / fetch / undici …      │
   └────────────────────────────────┘
            │
            ▼
       applyFilter / applyAjvFilter            (lib: existing)
            │
            ▼
       applyTranslations                       (lib: existing, optional)
            │
            ▼
       wrapArrayForStructuredContent           (lib: new thin wrapper around generateArrayWrapperKey)
            │
            ▼
       ResponseValidator.validateResponse      (lib: existing, non-throwing)
            │
            ▼
       buildToolResult                         (lib: new — MCP CallToolResult shape)
                  on caught error:
                  buildToolErrorResult         (lib: new)
```

Each box is a single function. Each function has one responsibility, no
side effects, and is unit-testable in isolation.

## Decisions to surface before coding

Stubs below are defaults; change if you disagree.

| # | Question | Default |
|---|----------|---------|
| 1 | Does the lib include an HTTP client? | **No.** Stays I/O-free. We expose a `ToolRequestPlan` that the caller hands to its own HTTP client. An optional `executeToolCall()` orchestrator accepts a caller-supplied `fetch`-like function so the caller can opt into the glue without us shipping axios. |
| 2 | Does the lib know about backends (`baseUrl`, `apiId`, `useSimpleAuth`)? | **No.** Backend config stays on caller side. Plan returns a *path* (not a full URL); caller prepends its base URL. Plan returns the *forwarded auth headers from the incoming request*; caller adds `x-apigw-api-id` and decides whether to drop `x-authorization` for simple-auth backends. |
| 3 | Does the lib own a `ToolRegistry`? | **Yes — small `Map`-backed registry**, mirroring `SchemaFilterRegistry`. Stores `Endpoint` keyed by tool name (the same name `generateToolName` produces). Ergonomic for callers that already build one filter registry per spec; nothing prevents a caller from skipping it. |
| 4 | One JSON-RPC error type or two? | **One — keep `SchemaFilterError`.** Tool-call failures that originate inside the lib (unknown tool, missing required path param, schema-filter blow-up) throw `SchemaFilterError` or a new sibling `ToolCallError` from `errors.ts`. JSON-RPC error codes (`-32602` etc.) are a transport concern and stay in the bridge. |
| 5 | Do we model "tool execution error" vs "protocol error"? | **Yes, by return shape.** Recoverable errors (HTTP failure from backend, validation warnings) → `CallToolResult` with `isError: true`. Programmer/protocol errors (unknown tool, missing path param) → thrown `ToolCallError`. Same split the bridge uses. |
| 6 | Where does the array-wrapping for `structuredContent` happen? | **Lib.** `wrapArrayForStructuredContent(toolName, data)` reuses the already-exported `generateArrayWrapperKey`. MCP requires `structuredContent` to be an object; that requirement comes from the spec, not the caller. |
| 7 | Should `planToolRequest` URL-encode path params, like the bridge? | **Yes.** `encodeURIComponent` per segment. Matches existing behaviour in `ToolsManager.buildRequest`. |
| 8 | How are array query params serialised? | **Caller chooses.** The plan returns query parameters as `Record<string, string \| number \| boolean \| Array<string \| number \| boolean>>`. We export a small helper `serializeQueryParameters(params, style?)` (default style mirrors the bridge: repeat key, e.g. `key=a&key=b`) that the caller can plug into axios's `paramsSerializer` or call directly to build a query string. Keeping serialisation pluggable avoids baking `paramsSerializer` semantics into the lib. |
| 9 | Do we mutate inputs (request headers, args)? | **No.** All helpers return fresh objects. Cloning costs are trivial against typical request shapes. |
| 10 | Does the lib exchange the MCP token for a JWT? | **No.** `TokenManager` stays in the bridge — it requires DynamoDB + GAAS. The lib's request planner just forwards whatever `Authorization` / `x-authorization` arrive in the incoming headers (case-insensitive read, lower-case write), and the caller's JWT-mapping middleware runs *before* it calls `planToolRequest`. |

## New types

Add to `src/types.ts`:

```ts
/**
 * Per-segment plan for an outbound HTTP call to a backend, derived from an
 * Endpoint + tool arguments. The caller is responsible for prepending its
 * own base URL, executing the request, and applying any backend-specific
 * extras (e.g. x-apigw-api-id).
 */
export interface ToolRequestPlan {
    method: HttpMethod;
    /** Path with `{param}` segments substituted (URL-encoded). NOT prefixed
     *  with a base URL. Always starts with `/`. */
    path: string;
    /** Query parameters by name. Array values are preserved verbatim;
     *  serialisation is the caller's call (see `serializeQueryParameters`). */
    query: Record<string, string | number | boolean | Array<string | number | boolean>>;
    /** Headers forwarded from the incoming request (lower-case keys).
     *  Caller adds Content-Type, x-apigw-api-id, etc. */
    headers: Record<string, string>;
    /** Request body for POST/PUT/PATCH. Undefined for methods without a body. */
    body?: unknown;
}

/** MCP CallToolResult shape (per spec 2025-06-18). */
export interface CallToolResult {
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}

/**
 * Minimal abstraction over an HTTP error the caller is willing to translate
 * into a CallToolResult. Compatible with axios's error.response, but does
 * not depend on axios.
 */
export interface ToolHttpErrorResponse {
    status: number;
    statusText?: string;
    data?: unknown;
}
```

Add to `src/errors.ts`:

```ts
export class ToolCallError extends Error {
    override readonly cause?: unknown;
    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = "ToolCallError";
        this.cause = cause;
    }
}
```

`ToolCallError` is thrown for *programmer/protocol* failures (unknown tool,
missing required path parameter, body-builder bug). HTTP failures are
returned as `CallToolResult { isError: true }` via `buildToolErrorResult`.

## New files

```
src/tool/
  ToolRegistry.ts                    — Map<string, Endpoint>, mirrors SchemaFilterRegistry
  splitToolArguments.ts              — { path, query, header, body, leftover } from Endpoint + args
  applyPathParameters.ts             — substitute `{name}` in a path string
  serializeQueryParameters.ts        — multi-value-friendly query string serializer
  forwardAuthHeaders.ts              — case-insensitive read of Authorization / x-authorization
  planToolRequest.ts                 — orchestrator: returns ToolRequestPlan
  wrapArrayForStructuredContent.ts   — uses generateArrayWrapperKey when data is an Array
  buildToolResult.ts                 — { content, structuredContent }
  buildToolErrorResult.ts            — { content, isError: true } from ToolHttpErrorResponse | unknown
  executeToolCall.ts                 — OPTIONAL thin orchestrator (caller supplies fetch fn)
```

Tests, one per file:

```
test/tool/
  ToolRegistry.test.ts
  splitToolArguments.test.ts
  applyPathParameters.test.ts
  serializeQueryParameters.test.ts
  forwardAuthHeaders.test.ts
  planToolRequest.test.ts
  wrapArrayForStructuredContent.test.ts
  buildToolResult.test.ts
  buildToolErrorResult.test.ts
  executeToolCall.test.ts            — mock fetch fn; covers happy-path + HTTP error path
```

Plus an end-to-end fixture-driven test in `test/integration.test.ts` that
walks parse → register → plan → fake-fetch → format and asserts the final
`CallToolResult` for a representative endpoint.

## File-by-file specs

### `src/tool/ToolRegistry.ts`

Same shape as `SchemaFilterRegistry`. Keyed by tool name (the value
`generateToolName(endpoint)` returns), so callers populating both
registries from the same loop see them stay in sync.

```ts
import type { Endpoint } from "../types.js";
import { generateToolName } from "./generateToolName.js";

export class ToolRegistry {
    private readonly endpoints: Map<string, Endpoint> = new Map();

    add(endpoint: Endpoint): string {
        const name = generateToolName(endpoint);
        this.endpoints.set(name, endpoint);
        return name;
    }

    has(toolName: string): boolean { return this.endpoints.has(toolName); }
    get(toolName: string): Endpoint | undefined { return this.endpoints.get(toolName); }
    all(): Endpoint[] { return Array.from(this.endpoints.values()); }
    size(): number { return this.endpoints.size; }
    clear(): void { this.endpoints.clear(); }
}
```

### `src/tool/splitToolArguments.ts`

Categorises tool args using `endpoint.parameters[].in` and consumes whatever
remains as the body for methods that take one. Mirrors lines 514–574 of
`ToolsManager.buildRequest`, but pure.

```ts
import type { Endpoint } from "../types.js";

export interface SplitArguments {
    path: Record<string, unknown>;
    query: Record<string, unknown>;
    header: Record<string, unknown>;
    cookie: Record<string, unknown>;
    body: Record<string, unknown> | undefined;
}

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

export function splitToolArguments(endpoint: Endpoint, args: Record<string, unknown>): SplitArguments {
    const out: SplitArguments = { path: {}, query: {}, header: {}, cookie: {}, body: undefined };
    const handled = new Set<string>();

    for (const p of endpoint.parameters) {
        if (args[p.name] === undefined) continue;
        out[p.in][p.name] = args[p.name];
        handled.add(p.name);
    }

    if (endpoint.requestBody && METHODS_WITH_BODY.has(endpoint.method.toUpperCase())) {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
            if (handled.has(k) || v === undefined) continue;
            body[k] = v;
        }
        if (Object.keys(body).length > 0) out.body = body;
    }
    return out;
}
```

Tests cover: path-only, query-only, body-only, mixed, omitted-undefined,
arrays preserved, GET/HEAD/DELETE never producing a body, requestBody-less
endpoint.

### `src/tool/applyPathParameters.ts`

```ts
import { ToolCallError } from "../errors.js";

export function applyPathParameters(path: string, params: Record<string, unknown>): string {
    return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const value = params[name];
        if (value === undefined || value === null) {
            throw new ToolCallError(`Missing path parameter: ${name}`);
        }
        return encodeURIComponent(String(value));
    });
}
```

Tests cover: single param, multiple params, encoding (slashes / spaces /
unicode), missing required param throws `ToolCallError`, no-op when path
has no placeholders.

### `src/tool/serializeQueryParameters.ts`

```ts
type QueryValue = string | number | boolean | Array<string | number | boolean>;

export type QueryArrayStyle = "repeat" | "csv";

export function serializeQueryParameters(
    params: Record<string, QueryValue | undefined>,
    style: QueryArrayStyle = "repeat"
): string {
    const parts: string[] = [];
    for (const [key, raw] of Object.entries(params)) {
        if (raw === undefined) continue;
        if (Array.isArray(raw)) {
            if (style === "csv") {
                parts.push(`${encodeURIComponent(key)}=${raw.map((v) => encodeURIComponent(String(v))).join(",")}`);
            } else {
                for (const v of raw) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
            }
        } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(raw))}`);
        }
    }
    return parts.join("&");
}
```

Tests cover: empty input → `""`; primitive values; array repeat vs. csv;
encoding; mixing repeat with csv across keys is a non-feature (style is
per-call); `undefined` skipped, `null` serialised as `"null"` (document the
choice).

### `src/tool/forwardAuthHeaders.ts`

Pure case-insensitive picker that copies `Authorization` and
`x-authorization` from incoming headers into a fresh, lower-case-keyed
object. The caller decides what else to add.

```ts
type HeaderBag = Record<string, string | undefined> | Record<string, string | string[] | undefined>;

const AUTH_HEADERS = ["authorization", "x-authorization"];

export function forwardAuthHeaders(headers: HeaderBag): Record<string, string> {
    const lower = lowercaseKeys(headers);
    const out: Record<string, string> = {};
    for (const name of AUTH_HEADERS) {
        const value = lower[name];
        if (typeof value === "string" && value.length > 0) out[name] = value;
    }
    return out;
}

function lowercaseKeys(headers: HeaderBag): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(headers)) {
        if (v === undefined) continue;
        out[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    }
    return out;
}
```

Tests cover: mixed-case keys, multi-value array (first value wins), missing
headers, empty-string skipped.

### `src/tool/planToolRequest.ts`

Composes the helpers above. Returns a `ToolRequestPlan`. No I/O.

```ts
import type { Endpoint, ToolRequestPlan } from "../types.js";
import { splitToolArguments } from "./splitToolArguments.js";
import { applyPathParameters } from "./applyPathParameters.js";
import { forwardAuthHeaders } from "./forwardAuthHeaders.js";

export interface PlanToolRequestOptions {
    endpoint: Endpoint;
    args: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;
}

export function planToolRequest(options: PlanToolRequestOptions): ToolRequestPlan {
    const { endpoint, args, headers = {} } = options;
    const split = splitToolArguments(endpoint, args);
    const path = applyPathParameters(endpoint.path, split.path);
    const forwarded = forwardAuthHeaders(headers);
    const query = split.query as ToolRequestPlan["query"];
    return {
        method: endpoint.method,
        path,
        query,
        headers: forwarded,
        body: split.body,
    };
}
```

Tests cover: GET with path + query, POST with body, mixed args, missing
required path param surfaces `ToolCallError`, header forwarding,
unknown args (already filtered by AJV input schema upstream — we assume
they're harmless leftovers and test that they get dropped from query but
land in body for body-bearing methods).

### `src/tool/wrapArrayForStructuredContent.ts`

Thin wrapper around the existing `generateArrayWrapperKey`. Lives here
(rather than alongside it) because it is *the moment in the runtime
pipeline* where wrapping happens — keeping pure transforms separate from
runtime composition.

```ts
import { generateArrayWrapperKey } from "./generateArrayWrapperKey.js";

export function wrapArrayForStructuredContent(toolName: string, data: unknown): Record<string, unknown> {
    if (Array.isArray(data)) {
        return { [generateArrayWrapperKey(toolName)]: data };
    }
    if (data === null || typeof data !== "object") {
        // MCP requires structuredContent to be an object. Wrap primitives /
        // null under a generic "value" key so the contract holds.
        return { value: data };
    }
    return data as Record<string, unknown>;
}
```

Tests: arrays wrapped under derived key; primitives wrapped under
`"value"`; null wrapped under `"value"`; objects pass through.

### `src/tool/buildToolResult.ts`

Pure formatter. No validation lives here — that already happens via
`ResponseValidator` upstream and is non-throwing. We just shape the result.

```ts
import type { CallToolResult } from "../types.js";

export function buildToolResult(structuredContent: Record<string, unknown>): CallToolResult {
    return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
    };
}
```

Tests: shape, JSON-stringification, round-trip.

### `src/tool/buildToolErrorResult.ts`

Equivalent to lines 416–449 of `ToolsManager.callTool`, but framework-free.

```ts
import type { CallToolResult, ToolHttpErrorResponse } from "../types.js";

export function buildToolErrorResult(error: unknown): CallToolResult {
    const httpResponse = pickHttpResponse(error);
    if (httpResponse) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        error: `HTTP ${httpResponse.status}${httpResponse.statusText ? `: ${httpResponse.statusText}` : ""}`,
                        details: httpResponse.data,
                    }),
                },
            ],
            isError: true,
        };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
    };
}

function pickHttpResponse(error: unknown): ToolHttpErrorResponse | undefined {
    if (!error || typeof error !== "object") return undefined;
    const candidate = (error as { response?: unknown }).response;
    if (!candidate || typeof candidate !== "object") return undefined;
    const r = candidate as Record<string, unknown>;
    if (typeof r.status !== "number") return undefined;
    return {
        status: r.status,
        statusText: typeof r.statusText === "string" ? r.statusText : undefined,
        data: r.data,
    };
}
```

Tests: axios-shaped error → HTTP shape, plain `Error` → message shape,
non-Error throwables → `"Unknown error"`, missing status on a `response`
object → falls through to the message branch.

### `src/tool/executeToolCall.ts` *(optional orchestrator)*

Wraps the whole pipeline against a caller-supplied HTTP function. Not
required — callers can compose primitives — but offered as the canonical
recipe so the bridge becomes a thin shim instead of duplicating
orchestration.

```ts
import type {
    CallToolResult,
    Endpoint,
    SchemaFilterDefinition,
    AjvFilterDefinition,
    CatalogMappings,
    CodeLookup,
    ToolRequestPlan,
} from "../types.js";
import type { ResponseValidator } from "../validation/ResponseValidator.js";
import { planToolRequest } from "./planToolRequest.js";
import { applyFilter } from "../filter/applyFilter.js";
import { applyAjvFilter } from "../filter/applyAjvFilter.js";
import { applyTranslations } from "../filter/applyTranslations.js";
import { wrapArrayForStructuredContent } from "./wrapArrayForStructuredContent.js";
import { buildToolResult } from "./buildToolResult.js";
import { buildToolErrorResult } from "./buildToolErrorResult.js";
import { generateToolName } from "./generateToolName.js";

export interface HttpResponseLike { status: number; data: unknown; }

export interface ExecuteToolCallOptions {
    endpoint: Endpoint;
    args: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;

    /** Caller-supplied transport. Receives the plan; must return the parsed body. */
    httpClient: (plan: ToolRequestPlan) => Promise<HttpResponseLike>;

    /** Either filter type works. Pass null/undefined to skip filtering. */
    filter?: SchemaFilterDefinition | AjvFilterDefinition | null;

    /** Optional translation step. Caller supplies its own CodeLookup. */
    translations?: { mappings: CatalogMappings; lookup: CodeLookup } | null;

    /** Optional output validation. Validator does not throw. */
    validator?: ResponseValidator;
    outputSchema?: unknown;
}

export async function executeToolCall(opts: ExecuteToolCallOptions): Promise<CallToolResult> {
    const toolName = generateToolName(opts.endpoint);
    try {
        const plan = planToolRequest({
            endpoint: opts.endpoint,
            args: opts.args,
            headers: opts.headers,
        });
        const response = await opts.httpClient(plan);

        let data: unknown = response.data;
        if (opts.filter) {
            data = isAjvFilter(opts.filter)
                ? applyAjvFilter(data, opts.filter)
                : applyFilter(data, opts.filter);
        }
        if (opts.translations) {
            data = applyTranslations(data, opts.translations.mappings, opts.translations.lookup);
        }
        const structuredContent = wrapArrayForStructuredContent(toolName, data);

        if (opts.validator && opts.outputSchema) {
            // Non-throwing — caller-side observability is the validator's job.
            opts.validator.validateResponse(toolName, structuredContent, opts.outputSchema);
        }
        return buildToolResult(structuredContent);
    } catch (error) {
        return buildToolErrorResult(error);
    }
}

function isAjvFilter(f: SchemaFilterDefinition | AjvFilterDefinition): f is AjvFilterDefinition {
    return !("allowedFields" in f);
}
```

Tests cover: happy path with object response; happy path with array
response (wrapper key applied); HTTP error returned by `httpClient` →
`isError: true` shape; unknown-tool-style programmer error from
`planToolRequest` → also routed through `buildToolErrorResult`; both
filter types work; translations optional; validator optional.

## `src/index.ts` additions

```ts
// ─── Tool execution ───────────────────────────────────────────────────
export { ToolRegistry } from "./tool/ToolRegistry.js";
export { splitToolArguments } from "./tool/splitToolArguments.js";
export type { SplitArguments } from "./tool/splitToolArguments.js";
export { applyPathParameters } from "./tool/applyPathParameters.js";
export { serializeQueryParameters } from "./tool/serializeQueryParameters.js";
export type { QueryArrayStyle } from "./tool/serializeQueryParameters.js";
export { forwardAuthHeaders } from "./tool/forwardAuthHeaders.js";
export { planToolRequest } from "./tool/planToolRequest.js";
export type { PlanToolRequestOptions } from "./tool/planToolRequest.js";
export { wrapArrayForStructuredContent } from "./tool/wrapArrayForStructuredContent.js";
export { buildToolResult } from "./tool/buildToolResult.js";
export { buildToolErrorResult } from "./tool/buildToolErrorResult.js";
export { executeToolCall } from "./tool/executeToolCall.js";
export type { ExecuteToolCallOptions, HttpResponseLike } from "./tool/executeToolCall.js";
```

And add the new types/error to the type/error re-exports already in
`index.ts`:

```ts
// existing block
export type {
    // …
    ToolRequestPlan,
    CallToolResult,
    ToolHttpErrorResponse,
} from "./types.js";

export { OpenApiParseError, SchemaFilterError, ToolCallError } from "./errors.js";
```

## The plan (phases)

A single milestone. Each step lands in one PR — the new code is purely
additive, so each step compiles and tests stay green after each step.

1. **Types + error.** Add `ToolRequestPlan`, `CallToolResult`,
   `ToolHttpErrorResponse` to `src/types.ts`. Add `ToolCallError` to
   `src/errors.ts`. Wire them into `src/index.ts`.

2. **Pure helpers.** Land `splitToolArguments`, `applyPathParameters`,
   `serializeQueryParameters`, `forwardAuthHeaders`,
   `wrapArrayForStructuredContent`, `buildToolResult`,
   `buildToolErrorResult`. Each with its own unit test file. Coverage
   for new files ≥ 80% lines / branches / functions / statements.

3. **Composition.** Land `planToolRequest` and `ToolRegistry`. Add
   `test/tool/planToolRequest.test.ts` and `test/tool/ToolRegistry.test.ts`.

4. **Optional orchestrator.** Land `executeToolCall` with a mock
   `httpClient`. Test the happy path (object + array response) and the
   error path (`httpClient` rejects with `{ response: { status, data } }`,
   `httpClient` rejects with a plain `Error`).

5. **Integration.** Extend `test/integration.test.ts` with one
   end-to-end test: parse a fixture, build a tool registry, plan a
   request, run it through a fake HTTP function, filter + format, assert
   the final `CallToolResult.structuredContent`. Use an existing fixture
   to keep churn low.

6. **Docs.** Update `README.md`:

   - Module map: add a row for "Tool execution" listing the new exports.
   - Quickstart: append a step 8 showing planning + filtering + result
     construction against a stub `httpClient`.

7. **Verify.** `pnpm tsc-check && pnpm eslint && pnpm test && pnpm coverage`.
   Coverage threshold (80%) must hold. `dist/` is regenerated by
   `pnpm build` if needed.

## Testing strategy

Every new file gets a dedicated test file with at least one happy-path,
one boundary case, and one error case. The integration test ties the
pipeline together so a regression that *only* shows up at the boundary
between two helpers gets caught.

Specific edge cases pulled from the bridge implementation that the test
suite must exercise:

- Path placeholder URL-encoding (`/users/{id}` with `id = "a/b c"`).
- Multi-value query parameters (the bridge's `withAccGroups` style).
- POST with both path params and a body — body-builder must exclude
  path/query keys.
- GET/DELETE/HEAD with a defined `requestBody` in the OpenAPI spec —
  body must NOT be set.
- Array response wrapping uses the same key as `generateArrayWrapperKey`
  (parity test asserts equality for a known fixture).
- Axios-shaped error vs. plain Error vs. non-Error throwable.
- Headers arrive with mixed case (`Authorization` vs. `authorization`)
  and as `string | string[]` (API Gateway can deliver either).

## File-level change summary

All changes are additions or doc edits. Nothing existing is renamed or
removed.

| File | Change |
|------|--------|
| `src/types.ts` | add `ToolRequestPlan`, `CallToolResult`, `ToolHttpErrorResponse` |
| `src/errors.ts` | add `ToolCallError` |
| `src/index.ts` | add new exports |
| `src/tool/ToolRegistry.ts` | **new** |
| `src/tool/splitToolArguments.ts` | **new** |
| `src/tool/applyPathParameters.ts` | **new** |
| `src/tool/serializeQueryParameters.ts` | **new** |
| `src/tool/forwardAuthHeaders.ts` | **new** |
| `src/tool/planToolRequest.ts` | **new** |
| `src/tool/wrapArrayForStructuredContent.ts` | **new** |
| `src/tool/buildToolResult.ts` | **new** |
| `src/tool/buildToolErrorResult.ts` | **new** |
| `src/tool/executeToolCall.ts` | **new** *(optional orchestrator)* |
| `test/tool/ToolRegistry.test.ts` | **new** |
| `test/tool/splitToolArguments.test.ts` | **new** |
| `test/tool/applyPathParameters.test.ts` | **new** |
| `test/tool/serializeQueryParameters.test.ts` | **new** |
| `test/tool/forwardAuthHeaders.test.ts` | **new** |
| `test/tool/planToolRequest.test.ts` | **new** |
| `test/tool/wrapArrayForStructuredContent.test.ts` | **new** |
| `test/tool/buildToolResult.test.ts` | **new** |
| `test/tool/buildToolErrorResult.test.ts` | **new** |
| `test/tool/executeToolCall.test.ts` | **new** |
| `test/integration.test.ts` | extended with end-to-end tool-call assertion |
| `README.md` | add "Tool execution" module-map row and quickstart step |
| `package.json` | bump 0.2.x → 0.3.0 (additive feature release) |
| existing `src/**` files | unchanged |
| existing `test/**` files | unchanged (except `integration.test.ts`) |

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Library accidentally absorbs HTTP concerns when callers ask for "just one more thing". | The optional `executeToolCall` already gives 95% of callers what they need without us shipping axios. New requests for `baseUrl`/`apiId` knobs go in a follow-up plan, not this one. |
| Header forwarding diverges from what API Gateway actually sends. | `forwardAuthHeaders` accepts `string \| string[] \| undefined` to match API Gateway's `APIGatewayProxyEventHeaders`. Tested explicitly. |
| `splitToolArguments` drops body fields whose names collide with path/query parameters. | This matches the bridge's behaviour — it is by design (parameter names own those keys). Documented in JSDoc and tested. |
| `wrapArrayForStructuredContent` over-wraps an object whose root key collides with the wrapper key. | Wrapping only happens for arrays / primitives / null. Objects pass through. Test covers a tool name that would derive a key matching a real top-level field name. |
| `buildToolErrorResult` fails to recognise non-axios HTTP error shapes (e.g. `undici`/`fetch`). | We sniff for `error.response.{status, data}`; document it. Callers using fetch can normalise their thrown error to the `{ response }` shape, or call `buildToolErrorResult` themselves with a synthesised value. A future plan can add a `Response`-shaped recogniser if a real caller needs it. |
| Cyclomatic complexity creeps back in if all helpers get bundled. | The point of the split is testability. Each helper has a single responsibility and is exported individually. Refactoring guard: any new helper above ~20 lines of logic gets a sub-helper. |

## Out of scope

- A real HTTP client. Library stays I/O-free.
- Token / JWT exchange (`TokenManager`). Deployed-infra concern.
- Code-list catalog *loading*. Lookup function stays caller-supplied;
  `extractCatalogMappings` + `applyTranslations` are unchanged.
- Backend configuration (`baseUrl`, `apiId`, `useSimpleAuth`,
  `maxResponseSize`, TLS). Caller composes the URL and adds extra headers
  on top of `ToolRequestPlan.headers`.
- JSON-RPC framing (`jsonrpc`, `id`, `error.code`). That belongs to the
  bridge's MCP transport layer.
- Migrating `rbcz-digi-mcp-bridge` to consume these primitives. Done in a
  separate change once this lands.
