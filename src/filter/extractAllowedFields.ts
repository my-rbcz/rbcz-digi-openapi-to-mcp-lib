const COMBINERS = ["allOf", "anyOf", "oneOf"] as const;
const EXCLUDED = new Set(["x-asd-attribute", "x-example"]);

/**
 * Flat Set of every property name that appears anywhere in the schema tree.
 *
 * Walks `properties`, `allOf` / `anyOf` / `oneOf`, `additionalProperties`, and
 * `items` (arrays). Purely structural — does not care about types or required.
 */
export function extractAllowedFields(schema: unknown, collected: Set<string> = new Set()): string[] {
    if (!isObject(schema)) {
        return Array.from(collected);
    }
    handleArray(schema, collected);
    handleProperties(schema, collected);
    handleCombinators(schema, collected);
    handleAdditionalProperties(schema, collected);
    return Array.from(collected);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function handleArray(schema: Record<string, unknown>, collected: Set<string>): void {
    if (schema.type === "array" && schema.items) {
        extractAllowedFields(schema.items, collected);
    }
}

function handleProperties(schema: Record<string, unknown>, collected: Set<string>): void {
    const props = schema.properties;
    if (!props || typeof props !== "object") return;
    for (const [name, child] of Object.entries(props as Record<string, unknown>)) {
        if (EXCLUDED.has(name)) continue;
        collected.add(name);
        extractAllowedFields(child, collected);
    }
}

function handleCombinators(schema: Record<string, unknown>, collected: Set<string>): void {
    for (const combiner of COMBINERS) {
        const list = schema[combiner];
        if (!Array.isArray(list)) continue;
        for (const sub of list) extractAllowedFields(sub, collected);
    }
}

function handleAdditionalProperties(schema: Record<string, unknown>, collected: Set<string>): void {
    const ap = schema.additionalProperties;
    if (ap && typeof ap === "object") {
        extractAllowedFields(ap, collected);
    }
}