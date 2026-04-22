/**
 * Recursively remove every `x-*` attribute from an OpenAPI/JSON schema.
 *
 * Returns a deep-cloned object — the input is never mutated.
 */
export function cleanSchema(schema: unknown): unknown {
    if (schema === null || typeof schema !== "object") {
        return schema;
    }

    if (Array.isArray(schema)) {
        return schema.map(cleanSchema);
    }

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
        if (key.startsWith("x-")) continue;
        cleaned[key] = cleanSchema(value);
    }
    return cleaned;
}