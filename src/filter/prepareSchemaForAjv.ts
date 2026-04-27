import { transformNullableSchema } from "../schema/transformNullableSchema.js";

/**
 * Prepare an OpenAPI response schema for AJV stripping.
 *
 *   1. Lower OpenAPI 3.0 `nullable: true` to `type: [..., "null"]` so AJV
 *      accepts real `null` values (`transformNullableSchema` already
 *      deep-clones).
 *   2. On every plain object node that has `properties` and no existing
 *      `additionalProperties` keyword, set `additionalProperties: false`.
 *      This is what `removeAdditional: true` keys off — it strips
 *      undeclared fields at that node.
 *
 * **Combinators (`oneOf` / `anyOf` / `allOf`) are deliberately not
 * recursed into.** Locking branches with `additionalProperties: false`
 * would cause AJV to validate every branch and strip any field absent
 * from any branch — even fields legitimately allowed by the matching
 * branch. The matching branch ends up with only the keys present in all
 * branches.
 *
 * Result: extras inside combinator branches pass through unfiltered —
 * the same behaviour as the legacy `applyFilter` walker. Combinator-aware
 * stripping is a separate problem (e.g. via OpenAPI's `discriminator`)
 * and is out of scope here.
 *
 * Pure: input is never mutated.
 */
export function prepareSchemaForAjv(schema: unknown): unknown {
    return lockObjects(transformNullableSchema(schema));
}

/**
 * Recursively clone `schema` and inject `additionalProperties: false` on
 * every plain object node — i.e. nodes with `type: "object"` or
 * `properties`, *except* those that already declare an
 * `additionalProperties` keyword (preserving caller intent for both
 * `additionalProperties: true` and dynamic-map schemas like
 * `additionalProperties: { ... }`).
 *
 * Recurses through:
 *   - `properties` (each value)
 *   - `items` (array element schema)
 *   - `additionalProperties` when it is a schema (dynamic maps)
 *
 * Combinator branches (`oneOf` / `anyOf` / `allOf`) are intentionally
 * skipped — see the `prepareSchemaForAjv` doc for why locking branches
 * causes AJV to strip valid fields from the matching branch.
 *
 * Pure: input is never mutated; a fresh object is returned at every
 * level it touches.
 */
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
    if (isObject(out.additionalProperties)) {
        out.additionalProperties = lockObjects(out.additionalProperties);
    }

    // Combinators are intentionally NOT recursed into. See the doc comment
    // on prepareSchemaForAjv.

    return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function isObjectNode(s: Record<string, unknown>): boolean {
    return s.type === "object" || isObject(s.properties);
}
