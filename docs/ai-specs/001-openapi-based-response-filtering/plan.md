# Implementation plan — AJV-based response filtering (parallel rollout)

See `research.md` for the motivation. This plan turns the recommendation into
the smallest possible, reviewable change.

## Goal

Add an AJV-based response stripper **alongside** the existing hand-written
walker (`extractAllowedFields` + the
`applyFilter` / `filterObject` / `filterArray` / `filterDynamicObject`
family). The two implementations live in parallel so callers can:

1. build both filters from the same endpoint,
2. run both on the same response payload,
3. compare outputs to gain confidence the new path matches (or improves on)
   the legacy path,
4. choose per-call which one to use, and
5. eventually retire the legacy path in a follow-up plan once parity is
   validated in production.

Nothing is deleted in this plan. The legacy code stays exported and behaves
exactly as it does today.

Keep orthogonal concerns untouched:

- `extractCatalogMappings` is **already** a standalone step (commit
  `2e0b294`). It is no longer a field on `SchemaFilterDefinition`; callers
  invoke it on `filter.responseSchema` after building the filter. The new
  AJV path follows the same convention — catalog mappings are computed
  against the schema stored on the filter, exactly as for the legacy path.
- `applyTranslations` is unaffected. It operates on dot-notation paths, not
  on a flat field set.

## Why this is a small change

AJV's `removeAdditional: "all"` does the entire structural strip on its own:

> all additional properties are removed, regardless of `additionalProperties`
> keyword value (and no validation is made for them).

Concretely: at every object node that has a `properties` keyword, AJV keeps
only the keys named in `properties` (plus anything matched by
`patternProperties` or `additionalProperties`) and drops the rest. It does
this without any help from us — no `additionalProperties: false` injection,
no schema rewrite, no walk.

There is exactly one OpenAPI-3.0-specific fix-up the schema needs before we
hand it to AJV, and we already own the function that does it.

## OpenAPI 3.0 nullable lowering — what and why

### The mismatch

OpenAPI 3.0 expresses nullability with a sibling boolean:

```yaml
# OpenAPI 3.0
firstName:
  type: string
  nullable: true
```

JSON Schema (which AJV speaks) doesn't recognize `nullable`. It expresses
the same idea with a type array:

```yaml
# JSON Schema (and OpenAPI 3.1)
firstName:
  type: [string, "null"]
```

AJV reads `type: string`, sees a `null` value, and rejects it. The
`nullable: true` sibling is silently ignored because AJV doesn't know that
keyword.

### What goes wrong without lowering

Take a tiny endpoint:

```yaml
type: object
properties:
  id:         { type: string }
  middleName: { type: string, nullable: true }
  age:        { type: integer, nullable: true }
```

Backend returns:

```json
{ "id": "u-1", "middleName": null, "age": null, "leak": "DROP ME" }
```

Run that through `Ajv({ removeAdditional: "all" })` *without* lowering:

- `middleName: null` → fails `type: string`
- `age: null` → fails `type: integer`
- `validate.errors` now contains two type errors that look identical to a
  real bug, even though the spec author explicitly allowed `null`.
- `leak` still gets stripped (good), but the noise in `validate.errors`
  makes the `onUnknownField: "throw"` mode unusable — we can't tell a
  legitimately undeclared field from a `nullable` field that was never
  the problem.
- With `oneOf`/`anyOf`, the wrong branch gets picked because the `null`
  value rejects every branch whose type the spec lowered would have
  accepted.

### What the lowering does

`src/schema/transformNullableSchema.ts` (already in the repo, already used
by `ResponseValidator`) walks the schema and rewrites every

```yaml
{ type: <X>, nullable: true }
```

into

```yaml
{ type: [<X>, "null"] }
```

It recurses into `properties`, `items`, `additionalProperties`,
`allOf`/`anyOf`/`oneOf`. After the pass, the schema above becomes:

```yaml
type: object
properties:
  id:         { type: string }
  middleName: { type: [string, "null"] }
  age:        { type: [integer, "null"] }
```

And the same payload validates cleanly: `null` is accepted at the named
fields, `leak` is the only thing AJV strips, `validate.errors` is either
empty or contains exactly the unknown-field errors a caller would actually
want to act on.

### Known limit

`transformNullableSchema` does not rewrite `enum` lists when `nullable: true`
is set (`{ type: string, enum: [a, b], nullable: true }` becomes
`{ type: [string, "null"], enum: [a, b] }`, which still rejects `null`).
This is a pre-existing limitation also present in the legacy path's use of
this function, and we inherit it. If a fixture surfaces this, we extend the
existing function rather than fork a new one.

## Decisions to surface before coding

Stubs below are defaults; change them if the user disagrees.

| # | Question | Default |
|---|----------|---------|
| 1 | Should the new path replace or coexist with the legacy path? | **Coexist.** Both `applyFilter` (legacy) and `applyAjvFilter` (new) ship in 0.2.0. No breaking changes. A future plan handles deprecation/removal once the user has validated parity. |
| 2 | Naming for the new symbols? | **`AjvFilterDefinition`, `buildAjvFilter`, `applyAjvFilter`, `AjvFilterRegistry`, `ApplyAjvFilterOptions`.** Mirrors legacy names with an `Ajv` qualifier. Easy to grep, easy to delete later. |
| 3 | Is mutating input data in `applyAjvFilter` acceptable? | **No — clone.** `removeAdditional` mutates; clone via `structuredClone` before validating, matching the legacy contract. |
| 4 | Target OpenAPI versions? | **3.0 and 3.1.** 3.0's `nullable: true` is handled by reusing `transformNullableSchema`. |
| 5 | Should the new filter return validation errors to callers? | **Yes, optionally.** `ApplyAjvFilterOptions.onUnknownField?: "strip" \| "throw"`, defaults to `"strip"`. |
| 6 | Share `SchemaFilterRegistry` between the two filter types? | **No — separate `AjvFilterRegistry`.** Different value type; keeping them separate means we can delete the legacy registry in one move when the time comes. |
| 7 | Pre-process the schema once at build time, or on every `applyAjvFilter` call? | **Once, lazily, cached per filter instance** via the same `WeakMap` that caches the compiled validator. Cheaper than recomputing, simpler than threading a "prepared schema" field through the public type. |

## Target shape

Legacy `SchemaFilterDefinition` — **unchanged** by this plan:

```ts
// src/types.ts (already on main)
export interface SchemaFilterDefinition {
    backend: string;
    protocol: Protocol;
    operation: string;
    allowedFields: string[];
    responseSchema: unknown;
    description?: string;
}
```

New parallel type:

```ts
// src/types.ts (added)
export interface AjvFilterDefinition {
    backend: string;
    protocol: Protocol;
    operation: string;
    /** Original (post-deref) response schema. Same shape as the legacy
     *  type's `responseSchema` so `extractCatalogMappings` works
     *  identically against either filter type. */
    responseSchema: unknown;
    description?: string;
}
```

New AJV instance:

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
        removeAdditional: "all",
    });
    addFormats(cached);
    return cached;
}
```

**Do not reuse `createAjv` from `validation/`** — it is deliberately
`removeAdditional: false` and flipping it would change `ResponseValidator`
semantics for every existing consumer.

New `applyAjvFilter`:

```ts
// src/filter/applyAjvFilter.ts
import type { ValidateFunction } from "ajv";
import type { AjvFilterDefinition } from "../types.js";
import { SchemaFilterError, describeError } from "../errors.js";
import { transformNullableSchema } from "../schema/transformNullableSchema.js";
import { getFilterAjv } from "./createFilterAjv.js";

export type FilterErrorMode = "throw" | "passthrough";

export interface ApplyAjvFilterOptions {
    onError?: FilterErrorMode;                    // matches legacy contract
    onUnknownField?: "strip" | "throw";           // new
}

const validatorCache = new WeakMap<AjvFilterDefinition, ValidateFunction>();

export function applyAjvFilter(
    data: unknown,
    filter: AjvFilterDefinition,
    options: ApplyAjvFilterOptions = {}
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

function getValidator(filter: AjvFilterDefinition): ValidateFunction {
    const cached = validatorCache.get(filter);
    if (cached) return cached;
    const lowered = transformNullableSchema(filter.responseSchema);
    const compiled = getFilterAjv().compile(lowered as object);
    validatorCache.set(filter, compiled);
    return compiled;
}

function filterKey(f: AjvFilterDefinition): string {
    return `${f.backend}:${f.protocol}:${f.operation}`;
}
```

New `buildAjvFilter`:

```ts
// src/filter/buildAjvFilter.ts
import type { Endpoint, Protocol, AjvFilterDefinition } from "../types.js";

export interface BuildAjvFilterOptions {
    endpoint: Endpoint;
    backend: string;
    protocol: Protocol;
    description?: string;
}

export function buildAjvFilter(options: BuildAjvFilterOptions): AjvFilterDefinition | null {
    const { endpoint, backend, protocol, description } = options;
    const responseSchema = pickResponseSchema(endpoint);
    if (!responseSchema) return null;

    return {
        backend,
        protocol,
        operation: endpoint.path ? endpoint.method.toLowerCase() + pascalizePath(endpoint.path) : "",
        responseSchema,
        description,
    };
}

// `pickResponseSchema` and `pascalizePath` should be lifted out of the
// existing `buildSchemaFilter.ts` into a shared module
// (`src/filter/responseSchemaUtils.ts`) so both builders generate
// identical operation keys. If extraction is mechanical, do it; otherwise
// duplicate and add a "keep in sync" comment in both files.
```

New `AjvFilterRegistry` is a copy of `SchemaFilterRegistry` with the value
type swapped to `AjvFilterDefinition`. Same `${backend}:${protocol}:${operation}`
key shape so callers can keep both registries in sync.

## The plan

A single phase. Prototype and ship are the same step — the parity test is
both the validation gate and the regression net.

1. **Add the new files.** All additive; no legacy code is touched.

   - `src/filter/createFilterAjv.ts`
   - `src/filter/applyAjvFilter.ts`
   - `src/filter/buildAjvFilter.ts`
   - `src/filter/AjvFilterRegistry.ts`
   - *(optional)* `src/filter/responseSchemaUtils.ts` — extracted
     `pickResponseSchema` / `pascalizePath`.
   - `src/types.ts` — add `AjvFilterDefinition`.
   - `src/index.ts` — export the new symbols alongside the legacy block.

2. **Add tests.**

   - `test/filter/applyAjvFilter.test.ts` — basic strip cases (top-level
     extras, nested extras, array items).
   - `test/filter/applyAjvFilter.polymorphism.test.ts` — `oneOf`/`anyOf`
     branches each strip independently:

     ```ts
     it("strips extras from each oneOf branch independently", () => {
         const filter = buildAjvFilter({
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

         expect(applyAjvFilter({ kind: "a", a: "x", leak: 1 }, filter)).toEqual({ kind: "a", a: "x" });
         expect(applyAjvFilter({ kind: "b", b: 2, leak: 1 }, filter)).toEqual({ kind: "b", b: 2 });
     });
     ```

   - `test/filter/applyAjvFilter.nullable.test.ts` — confirms the lowering
     handles the OpenAPI 3.0 examples shown above (a `null` field is
     preserved, an unknown sibling is stripped, no spurious type errors
     in `validate.errors`).
   - **`test/filter/parity.test.ts` — the safety net for parallel
     rollout.** For each fixture endpoint, build both filters from the
     same `Endpoint`, run both on the same payload, and assert outputs are
     deep-equal. Where they intentionally diverge (e.g. AJV strips an
     extra that the legacy walker leaks), capture the diff in an explicit
     `expect(...).toEqual(...)` so divergence is documented and reviewed,
     not silent.

     ```ts
     // sketch
     for (const fx of FIXTURES) {
         it(`parity for ${fx.name}`, async () => {
             const spec = await parseOpenApiSpec(loadFixture(fx.name));
             for (const ep of spec.endpoints) {
                 const legacy = buildSchemaFilter({ endpoint: ep, backend: "mch", protocol: "mcp" });
                 const ajv = buildAjvFilter({ endpoint: ep, backend: "mch", protocol: "mcp" });
                 if (!legacy || !ajv) { expect(legacy).toEqual(ajv); continue; }
                 const legacyOut = applyFilter(fx.samplePayload, legacy);
                 const ajvOut = applyAjvFilter(fx.samplePayload, ajv);
                 expect(ajvOut).toEqual(legacyOut);
             }
         });
     }
     ```

     This file is the headline deliverable: it answers "is the new path
     safe to adopt?".

3. **Ship.** Bump `package.json` from `0.1.0` → `0.2.0` (additive feature
   release). Add a short "Two filtering paths" section to `README.md`
   describing when to choose each and how to compare.

   ```md
   ### Two filtering paths (0.2.0+)

   - `applyFilter` — original walker, structural where it can be, falls
     back to a flat `allowedFields` set elsewhere. Stable; default.
   - `applyAjvFilter` — AJV with `removeAdditional: "all"`. Strictly
     structural at every depth, handles `oneOf`/`anyOf`/`allOf`
     correctly. Recommended for new integrations; run side-by-side with
     `applyFilter` to validate parity before switching over.

   Both filters are built from the same `Endpoint`, share the same
   registry key shape, and are compatible with `extractCatalogMappings`
   + `applyTranslations`. Choose per call.
   ```

4. **Verify.** `pnpm tsc-check && pnpm eslint && pnpm test && pnpm coverage`.
   Coverage stays ≥ 80% — every new file has its own tests.

That's the entire plan. If the parity test surfaces a real divergence on a
fixture, fix the schema lowering or extend `transformNullableSchema` —
**don't** add a wholesale schema-rewrite pass until a fixture proves it's
needed.

## File-level change summary

All changes are additions or doc edits. Nothing is deleted or renamed.

| File | Change |
|------|--------|
| `src/filter/createFilterAjv.ts` | **new** |
| `src/filter/buildAjvFilter.ts` | **new** |
| `src/filter/applyAjvFilter.ts` | **new** |
| `src/filter/AjvFilterRegistry.ts` | **new** |
| `src/filter/responseSchemaUtils.ts` | **new** *(optional — only if `pickResponseSchema` / `pascalizePath` extracted from `buildSchemaFilter.ts`)* |
| `src/filter/buildSchemaFilter.ts` | unchanged *(or trivial: imports moved to `responseSchemaUtils.ts` if extracted)* |
| `src/filter/applyFilter.ts` | unchanged |
| `src/filter/SchemaFilterRegistry.ts` | unchanged |
| `src/filter/extractAllowedFields.ts` | unchanged |
| `src/filter/filterObject.ts` | unchanged |
| `src/filter/filterArray.ts` | unchanged |
| `src/filter/filterDynamicObject.ts` | unchanged |
| `src/filter/applyTranslations.ts` | unchanged |
| `src/filter/translateData.ts` | unchanged |
| `src/filter/resolveCatalogForPath.ts` | unchanged |
| `src/schema/collectAllProperties.ts` | unchanged |
| `src/schema/getFieldSchema.ts` | unchanged |
| `src/schema/transformNullableSchema.ts` | unchanged — reused by `applyAjvFilter` |
| `src/types.ts` | add `AjvFilterDefinition` |
| `src/index.ts` | add new exports alongside the legacy block |
| `package.json` | version bump 0.1.0 → 0.2.0 (additive) |
| `README.md` | new "Two filtering paths" section |
| `test/filter/applyAjvFilter.test.ts` | **new** |
| `test/filter/applyAjvFilter.polymorphism.test.ts` | **new** |
| `test/filter/applyAjvFilter.nullable.test.ts` | **new** |
| `test/filter/parity.test.ts` | **new** |
| existing `test/filter/*.test.ts` | unchanged |
| `test/integration.test.ts` | unchanged |

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| A real fixture exposes a combinator gotcha (`oneOf`/`anyOf`/`allOf`) where `removeAdditional: "all"` doesn't strip as expected | The parity test catches it. Fix is targeted — extend the lowering or add a narrow workaround for the specific shape, not a wholesale schema rewrite. Legacy path stays available. |
| `nullable` + `enum` interaction (transform doesn't add `null` to `enum`) | Pre-existing limitation of `transformNullableSchema`, also affects `ResponseValidator`. If a fixture surfaces it, extend the shared function — both paths benefit. |
| `structuredClone` slowdown on huge responses | Measure with a representative payload. Only add an opt-in `mutate: true` path if measured hot. Legacy path is unchanged so no regression risk for existing callers. |
| Both registries drift out of sync on operation/key shape | Extract `pickResponseSchema` and `pascalizePath` into `responseSchemaUtils.ts` so the operation key is built by exactly one function for both filter types. The parity test exercises key-equality explicitly. |
| Bundle size grows because legacy code is still shipped | Acceptable for one release. The follow-up deprecation plan removes the legacy path once parity is validated; that's where the size comes back. |

## Out of scope

- **Deprecating or deleting the legacy path.** Follow-up plan, written
  *after* the parity test has run against real production payloads for
  some agreed period and the user is satisfied. None of
  `extractAllowedFields`, `filterObject`, `filterArray`,
  `filterDynamicObject`, `collectAllProperties`, or `getFieldSchema` is
  removed in this plan.
- **Any wholesale schema-rewrite pass** (the previous draft of this plan
  proposed `prepareSchemaForAjv` to inject `additionalProperties: false`
  on every object node). With `removeAdditional: "all"`, this is
  unnecessary. Only add it if a fixture proves it is.
- Replacing `ResponseValidator` (separate role, deliberate
  `removeAdditional: false`).
- Changing `extractCatalogMappings` / translation logic. These are
  already standalone (commit `2e0b294`) and work against
  `filter.responseSchema` for both filter types.
- Supporting Swagger 2.0 (library is OpenAPI 3.x only).
