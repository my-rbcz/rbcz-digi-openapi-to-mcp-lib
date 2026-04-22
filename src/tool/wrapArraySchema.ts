/**
 * Wrap an `type: "array"` schema into an object with a single property whose
 * key is derived from the tool name. This keeps MCP structuredContent valid
 * (it must be an object, never an array).
 */
export function wrapArraySchema(arraySchema: Record<string, unknown>, wrapperKey: string): Record<string, unknown> {
    return {
        type: "object",
        properties: {
            [wrapperKey]: arraySchema,
        },
        required: [wrapperKey],
    };
}