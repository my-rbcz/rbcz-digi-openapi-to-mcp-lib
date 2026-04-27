import { Ajv } from "ajv";
import addFormatsImport from "ajv-formats";

// ajv-formats publishes its plugin as a CommonJS default export. With NodeNext
// module resolution the synthesized interop sometimes surfaces the plugin under
// `.default`; fall back to that when present so both shapes work.
const addFormats: (ajv: Ajv) => Ajv =
    (addFormatsImport as unknown as { default?: (ajv: Ajv) => Ajv }).default ?? (addFormatsImport as unknown as (ajv: Ajv) => Ajv);

let cached: Ajv | undefined;

/**
 * AJV instance used by `applyAjvFilter`. Mirrors `validation/createAjv.ts`
 * but with `removeAdditional: true` — the only meaningful difference.
 *
 * Why `true` (not `"all"`):
 *   - `"all"` strips any property not in `properties`, including dynamic
 *     keys legitimately matched by an `additionalProperties: <schema>`
 *     keyword. That breaks dynamic-map response shapes.
 *   - `true` strips only at object nodes that explicitly set
 *     `additionalProperties: false`. The schema-rewrite pass in
 *     `prepareSchemaForAjv` injects that keyword on every plain object
 *     node (without disturbing dynamic maps), so stripping is structural
 *     where we want it and inert where we don't.
 *
 * Do NOT reuse `createAjv` from `validation/`: it is deliberately
 * `removeAdditional: false` and flipping it would change `ResponseValidator`
 * semantics for every existing consumer.
 */
export function getFilterAjv(): Ajv {
    if (cached) return cached;
    cached = new Ajv({
        allErrors: true,
        strict: false,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: true,
    });
    addFormats(cached);
    return cached;
}
