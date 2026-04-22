import type { SchemaFilterDefinition } from "../types.js";

/**
 * A "dynamic object" is an OpenAPI schema with `additionalProperties` but no
 * `properties` block — e.g. a map keyed by currency code. We must preserve all
 * incoming keys and only filter the values against the additionalProperties
 * sub-schema.
 *
 * The filter used to walk values is injected to avoid a circular import.
 */
export function filterDynamicObject(
    value: Record<string, unknown>,
    fieldSchema: Record<string, unknown>,
    filter: SchemaFilterDefinition,
    walk: (data: unknown, filter: SchemaFilterDefinition, schema?: unknown) => unknown
): Record<string, unknown> {
    const valueSchema = fieldSchema.additionalProperties;
    const out: Record<string, unknown> = {};
    const useValueSchema = valueSchema && typeof valueSchema === "object";

    for (const [key, val] of Object.entries(value)) {
        out[key] = useValueSchema ? walk(val, filter, valueSchema) : val;
    }
    return out;
}

export function isDynamicObjectSchema(fieldSchema: unknown): fieldSchema is Record<string, unknown> {
    if (!fieldSchema || typeof fieldSchema !== "object") return false;
    const s = fieldSchema as Record<string, unknown>;
    return s.type === "object" && !!s.additionalProperties && !s.properties;
}