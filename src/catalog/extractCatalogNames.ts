import { isValidCatalogName } from "./isValidCatalogName.js";

/**
 * Walk any object (typically the full dereferenced OpenAPI document) and
 * collect unique `x-catalog` values. The returned list is sorted ASC for
 * deterministic output.
 */
export function extractCatalogNames(spec: unknown): string[] {
    const found = new Set<string>();
    visit(spec, found);
    return Array.from(found).sort();
}

function visit(obj: unknown, found: Set<string>): void {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
        for (const item of obj) visit(item, found);
        return;
    }
    recordIfCatalog(obj as Record<string, unknown>, found);
    for (const value of Object.values(obj as Record<string, unknown>)) {
        visit(value, found);
    }
}

function recordIfCatalog(obj: Record<string, unknown>, found: Set<string>): void {
    const raw = obj["x-catalog"];
    if (isValidCatalogName(raw)) {
        found.add(raw.trim());
    }
}