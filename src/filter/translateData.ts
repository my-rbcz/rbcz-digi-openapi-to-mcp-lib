import type { CatalogMappings, CodeLookup } from "../types.js";
import { resolveCatalogForPath } from "./resolveCatalogForPath.js";

/**
 * Recursively translate primitives inside `data` whose JSON path matches one
 * of the supplied catalog mappings. Objects and arrays are traversed with their
 * path extended; non-primitive values never trigger lookup.
 */
export function translateData(data: unknown, mappings: CatalogMappings, lookup: CodeLookup, currentPath: string = ""): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
        return data.map((item, index) => translateData(item, mappings, lookup, appendPath(currentPath, String(index))));
    }

    if (typeof data === "object") {
        return translateObject(data as Record<string, unknown>, mappings, lookup, currentPath);
    }

    return data;
}

function translateObject(obj: Record<string, unknown>, mappings: CatalogMappings, lookup: CodeLookup, currentPath: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(obj)) {
        out[field] = translateField(field, value, mappings, lookup, currentPath);
    }
    return out;
}

function translateField(field: string, value: unknown, mappings: CatalogMappings, lookup: CodeLookup, currentPath: string): unknown {
    const catalog = resolveCatalogForPath(mappings, currentPath, field);
    const fieldPath = appendPath(currentPath, field);

    if (catalog && (typeof value === "string" || typeof value === "number")) {
        return lookup(catalog, value);
    }

    if (value !== null && typeof value === "object") {
        return translateData(value, mappings, lookup, fieldPath);
    }

    return value;
}

function appendPath(prefix: string, segment: string): string {
    return prefix ? `${prefix}.${segment}` : segment;
}