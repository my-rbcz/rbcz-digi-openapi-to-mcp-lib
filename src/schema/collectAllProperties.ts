const COMBINERS = ["allOf", "anyOf", "oneOf"] as const;
const EXCLUDED_KEYS = new Set(["x-asd-attribute", "x-example"]);

/**
 * Walks a schema (and its allOf/anyOf/oneOf subschemas) collecting every
 * property name declared anywhere. Used when deciding which fields are valid
 * at a given nesting level.
 */
export function collectAllProperties(schema: unknown, collected: Set<string> = new Set()): Set<string> {
    if (!isObjectSchema(schema)) {
        return collected;
    }

    addDirectProperties(schema, collected);
    recurseCombinators(schema, collected);
    return collected;
}

function isObjectSchema(schema: unknown): schema is Record<string, unknown> {
    return !!schema && typeof schema === "object" && !Array.isArray(schema);
}

function addDirectProperties(schema: Record<string, unknown>, collected: Set<string>): void {
    const props = schema.properties;
    if (!props || typeof props !== "object") return;
    for (const name of Object.keys(props as Record<string, unknown>)) {
        if (!EXCLUDED_KEYS.has(name)) collected.add(name);
    }
}

function recurseCombinators(schema: Record<string, unknown>, collected: Set<string>): void {
    for (const combiner of COMBINERS) {
        const sub = schema[combiner];
        if (!Array.isArray(sub)) continue;
        for (const subSchema of sub) {
            collectAllProperties(subSchema, collected);
        }
    }
}