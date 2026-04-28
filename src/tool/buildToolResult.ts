import type { CallToolResult } from "../types.js";

/**
 * Shape an already-prepared object payload into an MCP `CallToolResult`
 * with both a JSON-stringified `content[0].text` block and the
 * `structuredContent`. Pure formatter — does not validate or filter.
 */
export function buildToolResult(structuredContent: Record<string, unknown>): CallToolResult {
    return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
    };
}