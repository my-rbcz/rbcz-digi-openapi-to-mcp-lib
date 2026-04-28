# Research — AJV-based filtering vs. response validation

Question: do `applyAjvFilter` (in `src/filter/`) and `ResponseValidator`
(in `src/validation/`) overlap enough that the validation step can be
removed entirely from the library?

## Function-by-function comparison

### What each pipeline actually does at runtime

| Aspect | `applyAjvFilter` (filter) | `ResponseValidator.validateResponse` (validation) |
|---|---|---|
| Engine | AJV (singleton via `getFilterAjv`) | AJV (per-validator instance via `createAjv`) |
| Schema preprocessing | `prepareSchemaForAjv`: `transformNullableSchema` + recursive injection of `additionalProperties: false` on every plain-object node | `transformNullableSchema` only |
| AJV options that differ | `removeAdditional: true` | `removeAdditional: false`, `verbose: true` |
| AJV options that match | `allErrors`, `strict: false`, `coerceTypes: false`, `useDefaults: false` | same |
| Walks the data once via | `validate(clonedData)` — return value **ignored** | `validate(data)` — return value **shaped into `ValidationResult`** |
| Mutates / strips? | Yes. Drops every property not declared in `properties` (except dynamic-map nodes, except inside `oneOf`/`anyOf`/`allOf`) | No |
| Reports? | No. `validate()`'s boolean and `validate.errors` are discarded | Yes. Returns `{ valid, errors, summary }` |
| Throws? | Only on AJV compile failure (wrapped in `SchemaFilterError`) — passthrough mode available | Never (compile failures get folded into a synthetic `errors[0]`) |
| Cache | `WeakMap<AjvFilterDefinition, ValidateFunction>` | `Map<toolName, ValidateFunction>` per validator instance |
| AJV instance | One module-level cached instance | One per `new ResponseValidator()` |

### What each one *catches*

`applyAjvFilter` only acts on **structural extras**. Because the
schema-rewrite injects `additionalProperties: false`, AJV walks and removes
(`removeAdditional: true`) any field not in `properties`. Other AJV checks
fire under the hood — `required`, `type`, `format`, `enum`,
`minimum`/`maximum`, `pattern` — but their errors are **thrown away** by
`applyAjvFilter` (`applyAjvFilter.ts:33–35`: it just calls
`validate(cloned)` and returns `cloned`).

`ResponseValidator` only **reports**. It runs the same AJV underneath, on a
schema that does *not* have `additionalProperties: false` injected, so it
cannot detect undeclared fields (for the same reason — schemas typically
omit that keyword). It does report what `applyAjvFilter` silently throws
away: `required`, `type`, `format`, `enum`, `minimum/maximum`, etc.

So the two are **complementary, not overlapping**:

- Filter strips extras → validation can't see the extras (because they've
  been removed) and the input schema doesn't lock them out anyway.
- Validation flags semantic issues → filter doesn't act on them (data
  passes through unchanged).

### How the runtime pipeline actually uses the validator today

`src/tool/executeToolCall.ts:65–67`:

```ts
if (opts.validator && opts.outputSchema) {
    opts.validator.validateResponse(toolName, structuredContent, opts.outputSchema);
}
```

The return value is discarded. `ResponseValidator` itself only logs on the
*skipped-because-no-properties* path; it does **not** log when validation
fails. So in the current shape, even when the caller wires up a validator
and a logger, **nothing observes the validation result**.

Net effect at runtime today: validation is a no-op side effect that
compiles every schema a second time and walks every response a second
time. The only observable behaviour is "double the AJV compile cost per
tool."

### Where validation would be genuinely useful

1. **Spec-drift telemetry** — counts of `required`/`type`/`format`
   violations as a signal that the OpenAPI doc has fallen behind the
   backend. Requires the caller to actually look at
   `ValidationResult.errors`.
2. **Test-time assertions** — proving that fixtures or recorded responses
   match the spec. This already works fine via direct calls; doesn't need
   to live in the runtime pipeline.
3. **Defensive guard before serialisation** — abort/redact when the
   response is structurally malformed. Not the current behaviour.

None of those are wired up by the library or by `executeToolCall`. They'd
all require additional caller-side glue.

## Verdict

### The case for removing it

- **Functionally redundant** in the runtime path: filter already runs AJV;
  doing it again gives no new behaviour because the result is discarded.
- **Cost**: two AJV instances per process, two compiles per tool, two
  walks per response.
- **Conceptual clutter**: `ValidationResult`, `ValidationError`,
  `ResponseValidator`, `ResponseValidatorOptions`,
  `formatValidationErrors`, `enhanceErrorMessage`, `summarizeErrors`,
  `createAjv`, plus matching tests — all just to compute a structure that
  is currently thrown away.
- **Two AJV factories** (`createAjv` vs `createFilterAjv`) with
  near-identical options diverge on `removeAdditional` and `verbose`.
  That's the only meaningful difference between the two pipelines.

### The case for keeping it (or an equivalent)

- Spec-drift visibility *is* useful, just not in its current form.
  Removing it removes the hook.
- Some callers might rely on `ResponseValidator` directly outside the
  tool-call path (e.g. test suites). Worth confirming before deletion.
- It is the only place that emits `enhanceErrorMessage`-style
  human-readable diagnostics. If you ever want to surface backend-spec
  mismatches in MCP error responses, you'd be rebuilding this.

## Suggested direction (research, not action)

If you do remove it, the cleanest replacement is to surface AJV's
already-running validation from inside `applyAjvFilter` via an optional
callback:

```ts
applyAjvFilter(data, filter, { onValidationErrors: (errs) => logger.warn(...) })
```

That gets you spec-drift telemetry from the *single* AJV walk you're
already paying for, with no second compile, no second instance, and no
separate concept.

The deletable surface then becomes:

- `src/validation/` (entire directory)
- `ResponseValidator` / `ResponseValidatorOptions` exports from
  `src/index.ts`
- `ValidationResult` / `ValidationError` types (or move them to
  filter-side)
- The `validator` + `outputSchema` parameters of
  `ExecuteToolCallOptions` (and the lines that read them)
- `test/validation/` and the `ResponseValidator` calls in
  `test/integration.test.ts`

## Open question to answer before pulling the trigger

Does the bridge (or any other caller) call
`ResponseValidator.validateResponse` outside the `executeToolCall`
orchestrator? If yes, the migration plan needs to redirect those call
sites to the AJV-filter callback (or to a thin standalone helper) before
the deletion lands.