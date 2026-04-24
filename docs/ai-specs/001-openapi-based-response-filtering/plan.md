# Implementation plan — AJV-based response filtering

See `research.md` for the motivation. This plan turns the recommendation into
concrete, reviewable steps.

## Goal

Replace the hand-written structural walker (`extractAllowedFields` + the
`applyFilter` / `filterObject` / `filterArray` / `filterDynamicObject`
family) with an AJV-based stripper driven directly by the OpenAPI response
schema.

Keep orthogonal concerns (`extractCatalogMappings` and `applyTranslations`)
untouched — they operate on dot-notation paths, not on a flat field set, and
are unaffected by the switch.

## Worked example — what we get today vs. what we want

This is the whole argument for the change in one picture.

**OpenAPI response schema (simplified, two different `id` fields at different depths):**

```yaml
type: object
properties:
  id: { type: string }                    # account ID
  owner:
    type: object
    properties:
      id: { type: number }                # person ID — different field
      name: { type: string }
```

**Backend returns this (imagine it's a buggy backend leaking extras):**

```json
{
  "id": "acct-1",
  "ssn": "123-45-6789",
  "owner": {
    "id": 42,
    "ssn": "123-45-6789",
    "name": "Alice"
  }
}
```

**Current `applyFilter` + flat `allowedFields = ["id", "owner", "name"]`:**

The flat set contains `id` because it exists *somewhere* in the tree. The
structural walker happens to use `collectAllProperties(activeSchema)` when a
schema is in scope (see `src/filter/filterObject.ts:33-40`), so it works for
this case. But the `allowedFields` **fallback path** (used whenever
`activeSchema` isn't structured) accepts any `id` anywhere. And the whole
`responseSchema` field is there just to keep the structural path working —
it's duplicated intent.

**Target `applyFilter` (AJV with `removeAdditional: "all"` + `additionalProperties: false` at every level):**

```json
{ "id": "acct-1", "owner": { "id": 42, "name": "Alice" } }
```

`ssn` is stripped at both levels, structurally, because at each object node
AJV only keeps keys declared under that node's own `properties`. One
mechanism, no fallbacks, no flat set.

## Decisions to surface before coding

Stubs below are defaults; change them if the user disagrees.

| # | Question | Default |
|---|----------|---------|
| 1 | Is `SchemaFilterDefinition.allowedFields` part of the **public** contract we must preserve? | **No — remove it.** Library is at `0.1.0`; a clean break is cheaper than carrying a dead field. |
| 2 | Is mutating input data in `applyFilter` acceptable? | **No — continue to clone.** AJV's `removeAdditional` mutates; we clone via `structuredClone` before validating. |
| 3 | Target OpenAPI versions? | **3.0 and 3.1.** 3.0's `nullable: true` is handled by **reusing the existing `src/schema/transformNullableSchema.ts`** — no need to reinvent. |
| 4 | How to handle `oneOf` / `anyOf` / `allOf` with `removeAdditional: "all"`? | **Schema-rewrite pass** sets `additionalProperties: false` on every object node. |
| 5 | Keep the `x-asd-attribute` / `x-example` exclusion from the current code? | **Drop.** These are *schema* extensions, never appear in response data. |
| 6 | Should the new filter return validation errors to callers? | **Yes, optionally.** Extend `ApplyFilterOptions` with `onUnknownField?: "strip" \| "throw"`. |

## Target shape

Trimmed `SchemaFilterDefinition`:

```ts
// src/types.ts
export interface SchemaFilterDefinition {
    backend: string;
    protocol: Protocol;
    operation: string;
    responseSchema: unknown;           // now pre-processed for AJV
    catalogMappings: CatalogMappings;  // unchanged — feeds applyTranslations
    description?: string;
    // allowedFields: string[];   ← removed
}
```

Rewritten `applyFilter`:

```ts
// src/filter/applyFilter.ts
import type { ValidateFunction } from "ajv";
import type { SchemaFilterDefinition } from "../types.js";
import { SchemaFilterError, describeError } from "../errors.js";
import { getFilterAjv } from "./createFilterAjv.js";

export type FilterErrorMode = "throw" | "passthrough";

export interface ApplyFilterOptions {
    onError?: FilterErrorMode;                    // retained contract
    onUnknownField?: "strip" | "throw";           // new in 0.2.0
}

const validatorCache = new WeakMap<SchemaFilterDefinition, ValidateFunction>();

export function applyFilter(
    data: unknown,
    filter: SchemaFilterDefinition,
    options: ApplyFilterOptions = {}
): unknown {
    const errorMode = options.onError ?? "throw";
    const unknownFieldMode = options.onUnknownField ?? "strip";

    try {
        const validate = getValidator(filter);
        const cloned = structuredClone(data);
        validate(cloned);                         // mutates `cloned`, strips extras

        if (unknownFieldMode === "throw" && validate.errors?.length) {
            const extras = validate.errors
                .filter((e) => e.keyword === "additionalProperties")
                .map((e) => `${e.instancePath}/${e.params.additionalProperty}`);
            if (extras.length) {
                throw new SchemaFilterError(
                    `Response for ${filterKey(filter)} contained undeclared fields: ${extras.join(", ")}`
                );
            }
        }

        return cloned;
    } catch (error) {
        if (errorMode === "passthrough") return data;
        throw error instanceof SchemaFilterError
            ? error
            : new SchemaFilterError(
                  `Failed to filter data for ${filterKey(filter)}: ${describeError(error)}`,
                  error
              );
    }
}

function getValidator(filter: SchemaFilterDefinition): ValidateFunction {
    const cached = validatorCache.get(filter);
    if (cached) return cached;
    const compiled = getFilterAjv().compile(filter.responseSchema as object);
    validatorCache.set(filter, compiled);
    return compiled;
}

function filterKey(f: SchemaFilterDefinition): string {
    return `${f.backend}:${f.protocol}:${f.operation}`;
}
```

Updated `buildSchemaFilter`:

```ts
// src/filter/buildSchemaFilter.ts (diff-style)
export function buildSchemaFilter(options: BuildSchemaFilterOptions): SchemaFilterDefinition | null {
    const { endpoint, backend, protocol, description } = options;

    const rawSchema = pickResponseSchema(endpoint);
    if (!rawSchema) return null;

    // catalog mappings want the ORIGINAL schema (with x-catalog extensions intact)
    const catalogMappings = extractCatalogMappings(rawSchema);

    // AJV wants a rewritten schema with nullable lowered and
    // additionalProperties: false set on every object node
    const responseSchema = prepareSchemaForAjv(rawSchema);
    if (!hasAnyProperty(responseSchema)) return null;   // replaces the old "no allowedFields" guard

    return {
        backend,
        protocol,
        operation: endpoint.path ? endpoint.method.toLowerCase() + pascalizePath(endpoint.path) : "",
        responseSchema,
        catalogMappings,
        description,
    };
}
```

## Phases

### Phase 0 — Prototype on fixtures (no source changes)

Write a throwaway test that walks the existing fixtures through the proposed
pipeline and asserts the stripped output. If this doesn't pass on the real
shapes, the rest of the plan is wrong.

```ts
// test/filter/ajvPrototype.test.ts  (DELETE after Phase 5 lands, or keep as characterization)
import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parseOpenApiSpec } from "../../src/parser/parseOpenApiSpec.js";
import { transformNullableSchema } from "../../src/schema/transformNullableSchema.js";
import { loadFixture } from "../fixtures/loadFixture.js";

function lockObjects(schema: unknown): unknown {
    // walk schema tree; for every node with `properties` and no
    // `additionalProperties`, set `additionalProperties: false`.
    // (Full impl lands in Phase 1 as prepareSchemaForAjv.)
}

describe("AJV prototype — does removeAdditional:all work on our real fixtures?", () => {
    it("minimal.yml: strips undeclared top-level field", async () => {
        const spec = await parseOpenApiSpec(loadFixture("minimal.yml"));
        const schema = spec.endpoints[0]!.responses["200"]!.content!["application/json"]!.schema;
        const prepared = lockObjects(transformNullableSchema(schema));

        const ajv = new Ajv({ removeAdditional: "all", strict: false, allErrors: true });
        addFormats(ajv);
        const validate = ajv.compile(prepared as object);

        const payload = { id: "x", bogus: "DROP ME" };
        validate(payload);
        expect(payload).toEqual({ id: "x" });
    });

    // repeat for nullable-and-x-attrs.yml, nested-catalogs.yml, array-response.yml
});
```

**Kill signal:** if any fixture — especially `nullable-and-x-attrs.yml` or
anything with polymorphism — produces wrong output here, stop. The rest of
the plan assumes this phase passed.

### Phase 1 — Add the schema-rewrite pass

New file: `src/filter/prepareSchemaForAjv.ts`.

One pure function. Reuses `transformNullableSchema` so we're not maintaining
two nullable converters:

```ts
// src/filter/prepareSchemaForAjv.ts
import { transformNullableSchema } from "../schema/transformNullableSchema.js";

/**
 * Prepare an OpenAPI response schema for AJV with `removeAdditional: "all"`.
 *
 *   1. Lowers OpenAPI 3.0 `nullable: true` to JSON Schema union types.
 *   2. Sets `additionalProperties: false` on every object node that has
 *      `properties` but no explicit `additionalProperties` (respects dynamic
 *      maps the spec author deliberately left open).
 *   3. Recurses into `properties`, `items`, `allOf`/`anyOf`/`oneOf`,
 *      and `additionalProperties` (when schema-valued).
 *
 * Pure: input is never mutated.
 */
export function prepareSchemaForAjv(schema: unknown): unknown {
    const nullableLowered = transformNullableSchema(schema);   // already deep-clones
    return lockObjects(nullableLowered);
}

function lockObjects(schema: unknown): unknown {
    if (!isObject(schema)) return schema;

    const out: Record<string, unknown> = { ...schema };

    if (isObjectNode(out) && !("additionalProperties" in out)) {
        out.additionalProperties = false;
    }

    if (isObject(out.properties)) {
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(out.properties)) next[k] = lockObjects(v);
        out.properties = next;
    }
    if (out.items !== undefined) out.items = lockObjects(out.items);
    if (isObject(out.additionalProperties)) out.additionalProperties = lockObjects(out.additionalProperties);
    for (const combiner of ["allOf", "anyOf", "oneOf"] as const) {
        if (Array.isArray(out[combiner])) out[combiner] = (out[combiner] as unknown[]).map(lockObjects);
    }

    return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}
function isObjectNode(s: Record<string, unknown>): boolean {
    return s.type === "object" || isObject(s.properties);
}
```

Unit-tested in isolation, no AJV dependency in its tests.

### Phase 2 — Introduce the AJV filter instance

New file: `src/filter/createFilterAjv.ts`. Mirrors `src/validation/createAjv.ts`
exactly — including the same `ajv-formats` interop workaround — but with
`removeAdditional: "all"`:

```ts
// src/filter/createFilterAjv.ts
import { Ajv } from "ajv";
import addFormatsImport from "ajv-formats";

const addFormats: (ajv: Ajv) => Ajv =
    (addFormatsImport as unknown as { default?: (ajv: Ajv) => Ajv }).default ??
    (addFormatsImport as unknown as (ajv: Ajv) => Ajv);

let cached: Ajv | undefined;

export function getFilterAjv(): Ajv {
    if (cached) return cached;
    cached = new Ajv({
        allErrors: true,
        strict: false,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: "all",    // ← the only meaningful difference from createAjv
    });
    addFormats(cached);
    return cached;
}
```

**Do not reuse `createAjv` from `validation/`** — it is deliberately
`removeAdditional: false` and flipping it would change `ResponseValidator`
semantics for every existing consumer.

### Phase 3 — Rewrite `buildSchemaFilter` and `applyFilter`

See the code snippets under "Target shape" above. Then delete, after tests go
green:

- `src/filter/extractAllowedFields.ts`
- `src/filter/filterObject.ts`
- `src/filter/filterArray.ts`
- `src/filter/filterDynamicObject.ts`
- `src/schema/collectAllProperties.ts` *(only consumer is the deleted `filterObject.ts` — grep to confirm before removal)*
- `src/schema/getFieldSchema.ts` *(same — verify no other consumer)*
- Their tests.

### Phase 4 — Public surface and types

1. `src/types.ts`: remove `allowedFields` from `SchemaFilterDefinition`.
2. `src/index.ts`: confirm `buildSchemaFilter`, `applyFilter`,
   `SchemaFilterRegistry`, `SchemaFilterDefinition`, `CatalogMappings`,
   `applyTranslations` all still export. Remove any re-exports of deleted
   files (there shouldn't be any — check).
3. `package.json`: bump `0.1.0` → `0.2.0` (breaking change).
4. Add a short breaking-change note at the top of `README.md`:

   ```md
   > **0.2.0**: `SchemaFilterDefinition.allowedFields` has been removed.
   > `applyFilter` is now AJV-driven. `responseSchema` is the single source
   > of truth.
   ```

### Phase 5 — Tests

**Adapt** — current assertions that need to change:

```ts
// test/filter/buildSchemaFilter.test.ts — before
expect(filter!.allowedFields.sort()).toEqual(["id", "status"]);

// after
expect(filter!.responseSchema).toMatchObject({
    type: "object",
    additionalProperties: false,        // rewrite pass added this
    properties: {
        id: { type: "string" },
        status: expect.objectContaining({ type: "string" }),
    },
});
```

```ts
// test/filter/applyFilter.test.ts — new polymorphism case that proves the point
it("strips extras from each oneOf branch independently", () => {
    const filter = buildSchemaFilter({
        endpoint: endpoint({
            "200": {
                description: "ok",
                content: {
                    "application/json": {
                        schema: {
                            oneOf: [
                                { type: "object", properties: { kind: { const: "a" }, a: { type: "string" } }, required: ["kind"] },
                                { type: "object", properties: { kind: { const: "b" }, b: { type: "number" } }, required: ["kind"] },
                            ],
                        },
                    },
                },
            },
        }),
        backend: "mch",
        protocol: "mcp",
    })!;

    expect(applyFilter({ kind: "a", a: "x", leak: 1 }, filter)).toEqual({ kind: "a", a: "x" });
    expect(applyFilter({ kind: "b", b: 2, leak: 1 }, filter)).toEqual({ kind: "b", b: 2 });
});
```

- `test/filter/SchemaFilterRegistry.test.ts` — unaffected.
- `test/integration.test.ts` — **primary regression signal.** Should stay
  green without edits; if it doesn't, that is the bug.

**Add:**

- `test/filter/prepareSchemaForAjv.test.ts` — unit tests for the rewrite pass
  (nullable lowering, `additionalProperties: false` insertion, dynamic-map
  preservation, combinator recursion).
- `test/filter/applyFilter.polymorphism.test.ts` — the `oneOf`/`anyOf` cases
  above. These are the tests that justify the whole change.

**Delete:**

- `test/filter/extractAllowedFields.test.ts`
- Any unit tests for `filterObject` / `filterArray` / `filterDynamicObject`.

### Phase 6 — Tidy

- `pnpm tsc-check && pnpm eslint && pnpm test`.
- `pnpm coverage` — filter/ line coverage should stay ≥ current (we deleted
  more lines than we added).
- Remove stale comments in `applyFilter.ts`. Update its top-of-file docstring
  to describe the AJV-based contract.

## File-level change summary

| File | Change |
|------|--------|
| `src/filter/prepareSchemaForAjv.ts` | **new** |
| `src/filter/createFilterAjv.ts` | **new** |
| `src/filter/buildSchemaFilter.ts` | modified |
| `src/filter/applyFilter.ts` | **rewritten** |
| `src/filter/extractAllowedFields.ts` | **deleted** |
| `src/filter/filterObject.ts` | **deleted** |
| `src/filter/filterArray.ts` | **deleted** |
| `src/filter/filterDynamicObject.ts` | **deleted** |
| `src/schema/collectAllProperties.ts` | **deleted** (if no other consumer) |
| `src/schema/getFieldSchema.ts` | **deleted** (if no other consumer) |
| `src/schema/transformNullableSchema.ts` | **unchanged — reused by `prepareSchemaForAjv`** |
| `src/filter/SchemaFilterRegistry.ts` | unchanged |
| `src/filter/applyTranslations.ts` | unchanged |
| `src/filter/translateData.ts` | unchanged |
| `src/filter/resolveCatalogForPath.ts` | unchanged |
| `src/types.ts` | remove `allowedFields` |
| `src/index.ts` | verify public surface |
| `package.json` | version bump 0.1.0 → 0.2.0 |
| `README.md` | breaking-change note |
| `test/filter/*` | see Phase 5 |

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Real production specs use heavier polymorphism than fixtures, breaking `removeAdditional: "all"` | Phase 0 is the gate. If the gate passes but production regresses, keep the old code path behind `applyFilter(..., { strategy: "legacy" })` for one release before deleting. |
| `nullable: true` edge case we don't know about | `prepareSchemaForAjv` tests every observed 3.0 pattern. `transformNullableSchema` already has coverage; we inherit it. |
| `structuredClone` slowdown on huge responses | Measure in `test/integration.test.ts` with a representative payload. Only add an opt-in `mutate: true` path if measured hot. |
| Downstream consumer reading `allowedFields` | Confirmed internal-only in `research.md`. Grep once more at Phase 3 right before deletion. |

## Out of scope

- Replacing `ResponseValidator` (separate role, deliberate
  `removeAdditional: false`).
- Changing `CatalogMappings` / translation logic.
- Supporting Swagger 2.0 (library is OpenAPI 3.x only).
