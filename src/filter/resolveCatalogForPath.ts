import type { CatalogMappings } from "../types.js";

/**
 * Find a catalog name for a given (parent-path, field) pair using this priority:
 *
 *   1. Exact match on `<parentPath>.<field>` (or just `<field>` at the root).
 *   2. Parent-path shortening: try successively shorter prefixes of parentPath.
 *   3. Plain field-name fallback.
 *
 * Returns undefined when no mapping applies.
 */
export function resolveCatalogForPath(mappings: CatalogMappings, parentPath: string, field: string): string | undefined {
    const exactPath = parentPath ? `${parentPath}.${field}` : field;
    if (mappings[exactPath]) return mappings[exactPath];

    const fromParentShortening = tryParentShortening(mappings, parentPath, field);
    if (fromParentShortening) return fromParentShortening;

    return mappings[field];
}

function tryParentShortening(mappings: CatalogMappings, parentPath: string, field: string): string | undefined {
    if (!parentPath) return undefined;
    const segments = parentPath.split(".");
    for (let i = segments.length; i > 0; i--) {
        const prefix = segments.slice(0, i).join(".");
        const candidate = `${prefix}.${field}`;
        if (mappings[candidate]) return mappings[candidate];
    }
    return undefined;
}