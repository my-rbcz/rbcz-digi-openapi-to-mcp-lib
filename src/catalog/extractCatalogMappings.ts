import type { CatalogMappings } from "../types.js";

const COMBINERS = ["allOf", "anyOf", "oneOf"] as const;

/**
 * Walk a schema and build a path-aware catalog mapping keyed by dot-notation.
 *
 * Path semantics:
 *   - `properties` extends the path by the property name.
 *   - `items` keeps the same path (array index is irrelevant for mapping lookup).
 *   - `allOf` / `anyOf` / `oneOf` keep the same path (combinators are merged into the parent).
 *   - `additionalProperties` keeps the same path (dynamic keys cannot be predicted).
 */
export function extractCatalogMappings(schema: unknown, mappings: CatalogMappings = {}, pathPrefix: string = ""): CatalogMappings {
    if (!isObject(schema)) return mappings;

    handleItems(schema, mappings, pathPrefix);
    handleProperties(schema, mappings, pathPrefix);
    handleCombinators(schema, mappings, pathPrefix);
    handleAdditionalProperties(schema, mappings, pathPrefix);

    return mappings;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function handleItems(schema: Record<string, unknown>, mappings: CatalogMappings, pathPrefix: string): void {
    if (schema.type === "array" && schema.items) {
        extractCatalogMappings(schema.items, mappings, pathPrefix);
    }
}

function handleProperties(schema: Record<string, unknown>, mappings: CatalogMappings, pathPrefix: string): void {
    const props = schema.properties;
    if (!props || typeof props !== "object") return;
    for (const [fieldName, fieldSchema] of Object.entries(props as Record<string, unknown>)) {
        const fieldPath = pathPrefix ? `${pathPrefix}.${fieldName}` : fieldName;
        recordFieldCatalog(fieldSchema, fieldPath, mappings);
        extractCatalogMappings(fieldSchema, mappings, fieldPath);
    }
}

function recordFieldCatalog(fieldSchema: unknown, fieldPath: string, mappings: CatalogMappings): void {
    if (!isObject(fieldSchema)) return;
    const catalog = fieldSchema["x-catalog"];
    if (typeof catalog === "string" && catalog.trim().length > 0) {
        mappings[fieldPath] = catalog;
    }
}

function handleCombinators(schema: Record<string, unknown>, mappings: CatalogMappings, pathPrefix: string): void {
    for (const combiner of COMBINERS) {
        const list = schema[combiner];
        if (!Array.isArray(list)) continue;
        for (const sub of list) {
            extractCatalogMappings(sub, mappings, pathPrefix);
        }
    }
}

function handleAdditionalProperties(schema: Record<string, unknown>, mappings: CatalogMappings, pathPrefix: string): void {
    const ap = schema.additionalProperties;
    if (ap && typeof ap === "object") {
        extractCatalogMappings(ap, mappings, pathPrefix);
    }
}