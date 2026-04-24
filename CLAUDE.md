# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Do not scan `docs/ai-specs/` by default

`docs/ai-specs/` is the user's workspace for prompts, research notes, feature
plans, and analysis artefacts. It is **not** project documentation, and it is
not meant to inform code exploration. When scanning the repo for a normal
coding task (grep, glob, agent searches), **skip `docs/ai-specs/`** unless
the user explicitly asks about it, references a file under it by path, or
asks you to write to it. If a spec there is relevant to the task at hand,
the user will point you at it.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Compile to `dist/` | `pnpm build` |
| Type-check only (no emit) | `pnpm tsc-check` |
| Run tests | `pnpm test` |
| Watch tests | `pnpm test:watch` |
| Coverage (v8, fails under 80% lines/stmts/fns/branches) | `pnpm coverage` |
| Lint | `pnpm eslint` |
| Lint and auto-fix | `pnpm eslint-fix` |

Run a single test file: `pnpm vitest run test/filter/applyFilter.test.ts`.
Run a single test by name: `pnpm vitest run -t "strips undeclared fields"`.

## What this library is (and is not)

A **pure, I/O-free** TypeScript library that turns an OpenAPI 3.x spec into the
primitives needed to back an MCP server. It does **not** run an MCP server, do
HTTP, touch S3, or cache anything. Callers supply the spec text, the HTTP
client, the catalog lookup function, and (optionally) a `Logger`.

Scope boundaries live in `README.md` under "Differences vs.
`rbcz-digi-mcp-bridge`" — business-logic filters (e.g. the MCH debitcards
status filter) and transport concerns belong to the caller.

## Architecture

The public API is a set of small, composable functions that form a pipeline.
Every consumer-facing symbol is re-exported from `src/index.ts` — treat that
file as the contract.

```
spec text ──▶ parseOpenApiSpec ──▶ ParsedSpec { endpoints, fullDocument }
                                       │
             ┌─────────────────────────┼──────────────────────────┐
             ▼                         ▼                          ▼
     buildToolDefinition      buildSchemaFilter          extractCatalogNames
     (per endpoint)           (per endpoint)             (whole doc)
             │                         │
             │                         ▼
             │                 SchemaFilterRegistry   ◀── keyed by
             │                         │                    ${backend}:${protocol}:${operation}
             ▼                         ▼
       MCPToolDefinition          at runtime:
                              applyFilter → applyTranslations → ResponseValidator
```

Directories under `src/` map one-to-one to pipeline stages:

- `parser/` — normalise JSON/YAML, **dereference `$ref` via SwaggerParser**
  (mandatory — downstream code assumes inlined schemas), walk paths to produce
  `Endpoint[]`.
- `tool/` — endpoint → `MCPToolDefinition` (`name`, `inputSchema`,
  `outputSchema`). `generateOutputSchema` wraps bare array responses in
  `{ properties: { <key>: [...] } }` because MCP `structuredContent` requires
  an object root.
- `schema/` — pure schema utilities: `cleanSchema` drops `x-*` extensions;
  `transformNullableSchema` rewrites OpenAPI 3.0 `nullable: true` to JSON
  Schema's `type: [..., "null"]`. Run before handing schemas to AJV.
- `catalog/` — `extractCatalogNames` (flat set) and `extractCatalogMappings`
  (dot-notation path → catalog name). Mappings are **path-aware on purpose**:
  a nested `status` under `currencyFolders.*` must not leak its catalog to a
  root-level `status`. See `test/fixtures/nested-catalogs.yml`.
- `filter/` — `buildSchemaFilter` derives a `SchemaFilterDefinition` per
  endpoint; `applyFilter` strips undeclared fields from runtime data.
  Arrays are checked before objects (JS `typeof [] === "object"`).
  `SchemaFilterRegistry` is an in-memory `Map` keyed by
  `${backend}:${protocol}:${operation}` — no persistence, no I/O.
  `applyTranslations` applies caller-supplied `CodeLookup` to mapped paths.
- `validation/` — AJV-backed `ResponseValidator` with per-tool compile cache.
  **Non-throwing** — returns `ValidationResult`. AJV is configured
  `removeAdditional: false` on purpose; filtering is a separate stage.

### Ongoing redesign

`docs/ai-specs/001-openapi-based-response-filtering/` contains `research.md`
and `plan.md` for replacing the custom structural walker in `src/filter/`
with an AJV-`removeAdditional: "all"` approach. Consult both before editing
`extractAllowedFields.ts`, `applyFilter.ts`, or the `filter*` helpers — the
plan specifies which files will be deleted.

## Conventions that are easy to miss

- **ESM-only.** `package.json` has `"type": "module"`, tsconfig uses
  `module: NodeNext`. Internal imports must include the `.js` extension
  even when importing `.ts` sources (e.g.
  `import { foo } from "./foo.js"`).
- **`noUncheckedIndexedAccess: true`.** `arr[i]` is `T | undefined`. Don't
  silence this with `!` unless the invariant is obvious at the call site.
- **Errors are typed.** Throw `OpenApiParseError` or `SchemaFilterError` from
  `src/errors.ts` — do not introduce ad-hoc `Error` subclasses.
- **`applyFilter` / `applyTranslations` throw by default.** Both accept
  `{ onError: "passthrough" }` for fail-safe mode. Keep that contract.
- **Coverage thresholds are enforced at 80%** (lines / statements / functions /
  branches). `src/index.ts` and `src/types.ts` are excluded from coverage.
- **Public surface is `src/index.ts`.** Adding an export without updating
  that file means it won't be shipped. `dist/` is the build output and is
  published; `files: ["dist"]` in package.json.
- **Test fixtures** live in `test/fixtures/*.yml|.json` and are loaded via
  `test/fixtures/loadFixture.ts`. Prefer adding a fixture over inlining
  large YAML in test files.

## README

`README.md` carries the canonical public-facing module map and usage
example. When behaviour diverges from README, fix the code or the README —
don't leave them inconsistent.
