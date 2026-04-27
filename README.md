# rbcz-digi-openapi-to-mcp-lib

Standalone TypeScript library that turns an OpenAPI 3.x specification into the building blocks
of an MCP server:

- Execution model (`Endpoint[]`).
- MCP tool definitions (`name`, `inputSchema`, `outputSchema`).
- Schema filters that strip undeclared fields from backend responses.
- Path-aware catalog mappings + response translation.
- AJV-backed response validation.

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
```

## Module map

| Entry point | Purpose |
|---|---|
| `parseOpenApiSpec` | Normalize → JSON/YAML → dereference `$ref` → extract endpoints. |
| `buildToolDefinition` | Endpoint → MCP tool (delegates to `generateToolName` / `generateInputSchema` / `generateOutputSchema`). |
| `cleanSchema` / `transformNullableSchema` | Pure schema utilities — drop `x-*`, convert OpenAPI `nullable: true` to JSON-Schema union types. |
| `extractCatalogNames` / `extractCatalogMappings` | Collect `x-catalog` references flat or as path-aware mappings. |
| `buildSchemaFilter` / `applyFilter` | Derive a `SchemaFilterDefinition` from an endpoint, then filter arbitrary response data. |
| `applyTranslations` | Translate codes in-place using a caller-supplied `CodeLookup`. |
| `SchemaFilterRegistry` | In-memory filter storage keyed by `${backend}:${protocol}:${operation}`. |
| `ResponseValidator` | AJV-backed, non-throwing response validator with per-tool compile cache. |

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
