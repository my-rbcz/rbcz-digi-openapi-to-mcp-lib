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
 *   3. For object nodes composed via `allOf`, hoist each branch's
 *      `properties` into the parent before locking. `allOf` is a schema
 *      intersection, so the union of all branch-declared properties is
 *      legitimately valid at the parent. Without the hoist, a parent with
 *      `type: object` + `allOf` (and no own `properties`) gets locked with
 *      `additionalProperties: false` against an empty `properties` map and
 *      AJV strips every field.
 *
 * **`oneOf` / `anyOf` branches are deliberately not recursed into.**
 * Locking branches with `additionalProperties: false` would cause AJV to
 * validate every branch and strip any field absent from any branch — even
 * fields legitimately allowed by the matching branch. Branch-aware
 * stripping for those combinators is a separate problem (e.g. via
 * OpenAPI's `discriminator`) and is out of scope here.
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
 * For nodes with `allOf`, branches' `properties` are merged into the
 * parent's `properties` before locking — see `prepareSchemaForAjv`'s doc
 * comment for the rationale. Branches themselves are still left as-is
 * (not locked), so they don't strip anything during validation.
 *
 * Recurses through:
 *   - `properties` (each value, including ones merged in from `allOf`)
 *   - `items` (array element schema)
 *   - `additionalProperties` when it is a schema (dynamic maps)
 *
 * `oneOf` / `anyOf` branches are intentionally skipped — locking them
 * would over-strip the matching branch's valid fields.
 *
 * Pure: input is never mutated; a fresh object is returned at every
 * level it touches.
 */
function lockObjects(schema: unknown): unknown {
    if (!isObject(schema)) return schema;

    const out: Record<string, unknown> = { ...schema };

    if (isObjectNode(out) && Array.isArray(out.allOf)) {
        const hoisted = hoistAllOfProperties(out.allOf);
        if (Object.keys(hoisted).length > 0) {
            out.properties = isObject(out.properties)
                ? { ...hoisted, ...out.properties }
                : hoisted;
        }
    }

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

    // oneOf / anyOf branches are intentionally NOT recursed into. allOf
    // branches are also left as-is — their property declarations were
    // hoisted above. See the prepareSchemaForAjv doc comment.

    return out;
}

/**
 * Walk every branch of an `allOf` (recursing through nested `allOf`s)
 * and collect a flat `name → schema` map of all declared `properties`.
 * Earlier branches win on conflict — this only drives `removeAdditional`,
 * so the choice doesn't affect validation correctness; AJV still runs
 * each branch's full schema against the data.
 */
function hoistAllOfProperties(branches: unknown[]): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const branch of branches) collectAllOfProperties(branch, merged);
    return merged;
}

function collectAllOfProperties(branch: unknown, into: Record<string, unknown>): void {
    if (!isObject(branch)) return;
    if (isObject(branch.properties)) {
        for (const [k, v] of Object.entries(branch.properties)) {
            if (!(k in into)) into[k] = v;
        }
    }
    if (Array.isArray(branch.allOf)) {
        for (const nested of branch.allOf) collectAllOfProperties(nested, into);
    }
}

function isObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function isObjectNode(s: Record<string, unknown>): boolean {
    return s.type === "object" || isObject(s.properties);
}