import type { SchemaFilterDefinition } from "../types.js";

/**
 * Filter array data using the appropriate items schema if one is available.
 * Falls back to recursing with no schema (structural filtering only).
 */
export function filterArray(
    data: unknown[],
    filter: SchemaFilterDefinition,
    activeSchema: unknown,
    walk: (data: unknown, filter: SchemaFilterDefinition, schema?: unknown) => unknown
): unknown[] {
    const itemsSchema = pickItemsSchema(activeSchema);
    return data.map((item) => walk(item, filter, itemsSchema));
}

function pickItemsSchema(activeSchema: unknown): unknown | undefined {
    if (!activeSchema || typeof activeSchema !== "object") return undefined;
    const s = activeSchema as Record<string, unknown>;
    // Explicit array schema or implicit schema that declares items.
    if ((s.type === "array" || s.type === undefined) && s.items) return s.items;
    return undefined;
}