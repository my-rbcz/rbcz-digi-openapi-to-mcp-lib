/**
 * Transform OpenAPI 3.0 `nullable: true` markers into JSON-Schema-compatible
 * `type: [<type>, "null"]` arrays so AJV can validate null values correctly.
 *
 * Returns a deep-cloned object — the input is never mutated.
 */
export function transformNullableSchema(schema: unknown): unknown {
    if (schema === null || typeof schema !== "object") {
        return schema;
    }

    if (Array.isArray(schema)) {
        return schema.map(transformNullableSchema);
    }

    const src = schema as Record<string, unknown>;
    const out: Record<string, unknown> = { ...src };

    applyNullableFlag(out);
    recurseKnownKeywords(out);

    return out;
}

function applyNullableFlag(out: Record<string, unknown>): void {
    if (out.nullable === true && typeof out.type === "string") {
        out.type = [out.type, "null"];
        delete out.nullable;
    }
}

const OBJECT_KEYWORDS = ["items", "additionalProperties"] as const;
const ARRAY_KEYWORDS = ["allOf", "anyOf", "oneOf"] as const;

function recurseKnownKeywords(out: Record<string, unknown>): void {
    if (out.properties && typeof out.properties === "object") {
        out.properties = mapObject(out.properties as Record<string, unknown>, transformNullableSchema);
    }

    for (const key of OBJECT_KEYWORDS) {
        const value = out[key];
        if (value && typeof value === "object") {
            out[key] = transformNullableSchema(value);
        }
    }

    for (const key of ARRAY_KEYWORDS) {
        const value = out[key];
        if (Array.isArray(value)) {
            out[key] = value.map(transformNullableSchema);
        }
    }
}

function mapObject<V>(obj: Record<string, V>, fn: (v: V) => unknown): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        next[k] = fn(v);
    }
    return next;
}