import { generateArrayWrapperKey } from "./generateArrayWrapperKey.js";

/**
 * MCP `structuredContent` must be an object. Arrays get wrapped under the
 * key derived from the tool name (`generateArrayWrapperKey`). Primitives /
 * `null` are wrapped under a generic `"value"` key so the contract holds.
 * Plain objects pass through.
 */
export function wrapArrayForStructuredContent(toolName: string, data: unknown): Record<string, unknown> {
    if (Array.isArray(data)) {
        return { [generateArrayWrapperKey(toolName)]: data };
    }
    if (data === null || typeof data !== "object") {
        return { value: data };
    }
    return data as Record<string, unknown>;
}