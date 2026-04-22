const COMBINERS = ["allOf", "anyOf", "oneOf"] as const;

/**
 * Resolve the sub-schema for a given field name, searching direct `properties`
 * first, then `allOf` / `anyOf` / `oneOf` branches recursively.
 *
 * Returns null when no matching sub-schema is found.
 */
export function getFieldSchema(schema: unknown, fieldName: string): unknown | null {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
        return null;
    }

    const obj = schema as Record<string, unknown>;
    const direct = pickDirectProperty(obj, fieldName);
    if (direct !== null) return direct;

    return pickFromCombinators(obj, fieldName);
}

function pickDirectProperty(obj: Record<string, unknown>, fieldName: string): unknown | null {
    const props = obj.properties;
    if (!props || typeof props !== "object") return null;
    const value = (props as Record<string, unknown>)[fieldName];
    return value === undefined ? null : value;
}

function pickFromCombinators(obj: Record<string, unknown>, fieldName: string): unknown | null {
    for (const combiner of COMBINERS) {
        const list = obj[combiner];
        if (!Array.isArray(list)) continue;
        for (const sub of list) {
            const found = getFieldSchema(sub, fieldName);
            if (found !== null) return found;
        }
    }
    return null;
}