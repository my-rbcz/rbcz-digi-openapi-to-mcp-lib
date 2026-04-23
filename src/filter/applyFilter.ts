import type { SchemaFilterDefinition } from "../types.js";
import { SchemaFilterError, describeError } from "../errors.js";
import { filterArray } from "./filterArray.js";
import { filterObject } from "./filterObject.js";

export type FilterErrorMode = "throw" | "passthrough";

export interface ApplyFilterOptions {
    onError?: FilterErrorMode;
}

/**
 * Apply a schema filter to arbitrary data. Strips fields not declared in the
 * endpoint's response schema (or in the filter's flat `allowedFields`).
 *
 * - null / undefined pass through.
 * - Arrays are detected before objects (JS `typeof [] === "object"`).
 * - Primitives pass through.
 *
 * By default internal errors bubble up as SchemaFilterError. Pass
 * `{ onError: "passthrough" }` to mirror the bridge's fail-safe behaviour.
 */
export function applyFilter(data: unknown, filter: SchemaFilterDefinition, options: ApplyFilterOptions = {}): unknown {
    const mode = options.onError ?? "throw";
    try {
        return walk(data, filter, filter.responseSchema);
    } catch (error) {
        if (mode === "passthrough") return data;
        throw new SchemaFilterError(`Failed to filter data for ${filter.backend}:${filter.protocol}:${filter.operation}: ${describeError(error)}`, error);
    }
}

function walk(data: unknown, filter: SchemaFilterDefinition, schema: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
        return filterArray(data, filter, schema, walk);
    }

    if (typeof data === "object") {
        return filterObject(data as Record<string, unknown>, filter, schema, walk);
    }

    return data;
}