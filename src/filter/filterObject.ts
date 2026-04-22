import type { SchemaFilterDefinition } from "../types.js";
import { collectAllProperties } from "../schema/collectAllProperties.js";
import { getFieldSchema } from "../schema/getFieldSchema.js";
import { filterDynamicObject, isDynamicObjectSchema } from "./filterDynamicObject.js";

const EXCLUDED = new Set(["x-asd-attribute", "x-example"]);

/**
 * Filter an object's fields against either the schema's collected properties
 * or the filter's flat `allowedFields` list when no schema is in scope.
 */
export function filterObject(
    obj: Record<string, unknown>,
    filter: SchemaFilterDefinition,
    activeSchema: unknown,
    walk: (data: unknown, filter: SchemaFilterDefinition, schema?: unknown) => unknown
): Record<string, unknown> {
    const allowed = resolveAllowedSet(filter, activeSchema);
    if (!allowed) {
        // No restrictions known — return a defensive clone of the input to avoid caller mutation.
        return { ...obj };
    }

    const out: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(obj)) {
        if (EXCLUDED.has(field)) continue;
        if (!allowed.has(field)) continue;
        out[field] = filterField(value, field, filter, activeSchema, walk);
    }
    return out;
}

function resolveAllowedSet(filter: SchemaFilterDefinition, activeSchema: unknown): Set<string> | null {
    if (hasStructuredSchema(activeSchema)) {
        return collectAllProperties(activeSchema);
    }
    const fields = (filter.allowedFields ?? []).filter((f) => !EXCLUDED.has(f));
    if (fields.length === 0) return null;
    return new Set(fields);
}

function hasStructuredSchema(schema: unknown): boolean {
    if (!schema || typeof schema !== "object") return false;
    const s = schema as Record<string, unknown>;
    return !!s.properties || !!s.allOf || !!s.anyOf || !!s.oneOf;
}

function filterField(
    value: unknown,
    field: string,
    filter: SchemaFilterDefinition,
    activeSchema: unknown,
    walk: (data: unknown, filter: SchemaFilterDefinition, schema?: unknown) => unknown
): unknown {
    if (value === null || typeof value !== "object") {
        return value;
    }
    const fieldSchema = getFieldSchema(activeSchema, field);
    if (!fieldSchema) {
        return walk(value, filter, undefined);
    }
    if (isDynamicObjectSchema(fieldSchema)) {
        return filterDynamicObject(value as Record<string, unknown>, fieldSchema, filter, walk);
    }
    return walk(value, filter, fieldSchema);
}