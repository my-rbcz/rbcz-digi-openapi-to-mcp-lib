# rbcz-digi-openapi-to-mcp-lib

Standalone TypeScript library that turns an OpenAPI 3.x specification into the building blocks
of an MCP server:

- Execution model (`Endpoint[]`).
- MCP tool definitions (`name`, `inputSchema`, `outputSchema`).
- Schema filters that strip undeclared fields from backend responses.
- Path-aware catalog mappings + response translation.
- AJV-backed response validation.
- Tool-call primitives that plan an outbound HTTP request, shape the
  response into an MCP `CallToolResult`, and format errors — without ever
  performing I/O themselves.

This package does **not** perform I/O (no S3,
no HTTP, no filesystem), does **not** run an MCP server, and does **not** cache anything
— callers supply the spec content, the HTTP client, and the catalog lookup function.

## Install

```
pnpm install
pnpm build
pnpm test
pnpm coverage
```

## Examples

Two runnable sample projects live under `examples/` and are **not** part of
the published package:

- **`examples/mock-mch/`** — a tiny zero-dependency Node HTTP server that
  serves canned fixtures for the MCH OpenAPI surface. Start it with
  `PORT=3000 node server.js`.
- **`examples/mcp-sample/`** — a minimal MCP server that wires this library
  end-to-end against the mock backend (parses an OpenAPI spec, builds tool
  definitions, registers AJV filters, dispatches `tools/call` through
  `executeToolCall`). It depends on the library via `file:../..`, so build
  the lib first (`pnpm build` at the repo root), then `pnpm install && pnpm
  build && pnpm start` from `examples/mcp-sample/`.

See each example's `README.md` for details. They are excluded from the
published tarball by `files: ["dist"]`.

## Quickstart

```ts
import {
    parseOpenApiSpec,
    buildToolDefinition,
    buildSchemaFilter,
    applyFilter,
    applyTranslations,
    ResponseValidator,
    SchemaFilterRegistry,
    extractCatalogNames,
    extractCatalogMappings,
} from "rbcz-digi-openapi-to-mcp-lib";

// 1. Parse — takes a string (JSON/YAML) or a pre-parsed object.
const spec = await parseOpenApiSpec(myYamlOrJson);

// 2. Generate MCP tools.
const tools = spec.endpoints.map(buildToolDefinition);

// 3. Build and register response filters.
const registry = new SchemaFilterRegistry();
for (const endpoint of spec.endpoints) {
    const filter = buildSchemaFilter({ endpoint, backend: "mch", protocol: "mcp" });
    if (filter) registry.add(filter);
}

// 4. At runtime, after calling the backend:
const filter = registry.get("mch", "mcp", "getDebitcards")!;
const filtered = applyFilter(responseData, filter);

// 5. Extract catalog mappings as a standalone step, then translate codes
//    via your caller-supplied lookup function.
const catalogMappings = extractCatalogMappings(filter.responseSchema);
const translated = applyTranslations(filtered, catalogMappings, (catalog, value) =>
    myCatalogLookup(catalog, value)
);

// 6. (Optional) Validate the final payload.
const validator = new ResponseValidator();
const result = validator.validateResponse("getDebitcards", translated, tools[0]!.outputSchema);

// 7. Discover which catalogs you need from the full dereferenced doc.
const catalogs = extractCatalogNames(spec.fullDocument);

// 8. At tool-call time, plan the outbound HTTP request, run it through your
//    own client, then filter + format the response into an MCP CallToolResult.
import {
    ToolRegistry,
    planToolRequest,
    executeToolCall,
} from "rbcz-digi-openapi-to-mcp-lib";

const toolRegistry = new ToolRegistry();
for (const endpoint of spec.endpoints) toolRegistry.add(endpoint);

const endpoint = toolRegistry.get("getDebitcards")!;

// Either compose primitives yourself…
const plan = planToolRequest({ endpoint, args: { id: "42" }, headers: incomingHeaders });
// caller does HTTP: const response = await myAxios({ ...plan, baseURL });

// …or use the optional orchestrator with a fetch-like function:
const result = await executeToolCall({
    endpoint,
    args: { id: "42" },
    headers: incomingHeaders,
    httpClient: async (plan) => {
        const response = await myAxios({ method: plan.method, url: plan.path, params: plan.query, data: plan.body, headers: plan.headers });
        return { status: response.status, data: response.data };
    },
    filter,
    translations: { mappings: catalogMappings, lookup: myCatalogLookup },
    validator,
    outputSchema: tools[0]!.outputSchema,
});
```

## Module map

| Entry point | Purpose |
|---|---|
| `parseOpenApiSpec` | Normalize → JSON/YAML → dereference `$ref` → extract endpoints. |
| `buildToolDefinition` | Endpoint → MCP tool (delegates to `generateToolName` / `generateInputSchema` / `generateOutputSchema`). |
| `cleanSchema` / `transformNullableSchema` | Pure schema utilities — drop `x-*`, convert OpenAPI `nullable: true` to JSON-Schema union types. |
| `extractCatalogNames` / `extractCatalogMappings` | Collect `x-catalog` references flat or as path-aware mappings. |
| `buildSchemaFilter` / `applyFilter` | Derive a `SchemaFilterDefinition` from an endpoint, then filter arbitrary response data. |
| `buildAjvFilter` / `applyAjvFilter` | AJV-based parallel of the above (0.2.0+). See [Two filtering paths](#two-filtering-paths-020). |
| `applyTranslations` | Translate codes in-place using a caller-supplied `CodeLookup`. |
| `SchemaFilterRegistry` / `AjvFilterRegistry` | In-memory filter storage keyed by `${backend}:${protocol}:${operation}`. Same key shape so both registries stay in sync. |
| `ResponseValidator` | AJV-backed, non-throwing response validator with per-tool compile cache. |
| `ToolRegistry` / `planToolRequest` / `splitToolArguments` / `applyPathParameters` / `serializeQueryParameters` / `forwardAuthHeaders` / `wrapArrayForStructuredContent` / `buildToolResult` / `buildToolErrorResult` / `executeToolCall` | Tool-call primitives. Plan outbound HTTP requests from `Endpoint` + args, shape backend responses into MCP `CallToolResult` shapes, and format errors. The library still performs no I/O — `executeToolCall` takes a caller-supplied HTTP function. |

## Two filtering paths (0.2.0+)

Two response strippers ship side by side:

- **`applyFilter`** — original walker. Structural where it can be, falls
  back to a flat `allowedFields` set elsewhere. Stable; default.
- **`applyAjvFilter`** — AJV with `removeAdditional: true`, driven by a
  schema-rewrite pass that injects `additionalProperties: false` on every
  plain object node (without disturbing `additionalProperties: <schema>`
  dynamic maps). Strictly structural at every depth.

Both are built from the same `Endpoint` and share the same operation-key
shape, so the two registries can be populated from one loop and queried
identically. Both are compatible with `extractCatalogMappings` +
`applyTranslations`.

```ts
import { buildAjvFilter, applyAjvFilter, AjvFilterRegistry } from "rbcz-digi-openapi-to-mcp-lib";

const ajvRegistry = new AjvFilterRegistry();
for (const endpoint of spec.endpoints) {
    const f = buildAjvFilter({ endpoint, backend: "mch", protocol: "mcp" });
    if (f) ajvRegistry.add(f);
}

const f = ajvRegistry.get("mch", "mcp", "getDebitcards")!;
const filtered = applyAjvFilter(responseData, f);
```

**Known limitation:** combinator branches (`oneOf` / `anyOf` / `allOf`)
pass through unfiltered — locking each branch with
`additionalProperties: false` would cause AJV to validate every branch
and strip any field absent from any branch, including fields the
matching branch legitimately allows. This matches the legacy walker's
behaviour, which doesn't recurse into combinators either. See
`src/filter/prepareSchemaForAjv.ts`.

A parity test (`test/filter/parity.test.ts`) runs both filters on every
fixture endpoint and asserts identical output. Use it as a template for
asserting parity on your own production-shaped payloads before switching
over.

## Notable behaviour

- **Dereference, not validate.** `SwaggerParser.dereference()` is required so that schema filters
  see inlined `$ref` trees.
- **Array responses are wrapped.** `getClients` returning `type: array` becomes
  `{ type: "object", properties: { clients: <arr> }, required: ["clients"] }` to keep MCP
  `structuredContent` valid.
- **Path-aware catalog mappings.** A nested `status` under `currencyFolders.*` won't leak its
  catalog to the root-level `status`. See `test/fixtures/nested-catalogs.yml`.
- **Arrays are detected before objects.** Prevents the JS pitfall where `Object.keys([1,2,3])`
  would otherwise cause arrays to get filtered out as unknown fields.
- **AJV nullable transform.** Schemas pass through `transformNullableSchema` before compile so
  `nullable: true` validates real `null` values.

## Differences vs. `rbcz-digi-mcp-bridge`

- The MCH `getDebitcards` status filter (`"1" | "8"` only) is **removed**. It is business logic;
  wrap `applyFilter` yourself if you need it.
- `applyFilter` / `applyTranslations` throw `SchemaFilterError` by default. Pass
  `{ onError: "passthrough" }` to mirror the bridge's fail-safe behaviour.
- Spec I/O is out of scope. `parseOpenApiSpec` takes content, not an S3 location.
- No S3, no AWS SDK, no axios, no logger dependency — pass in a `Logger` if you want one.
