import type { CallToolResult, ToolHttpErrorResponse } from "../types.js";

/**
 * Translate any thrown value into an MCP `CallToolResult` with `isError: true`.
 *
 * Recognises the axios-style `{ response: { status, statusText?, data? } }`
 * shape and emits an `HTTP <status>: <statusText>` message with the response
 * body included as `details`. Otherwise falls back to `error.message` for
 * `Error` instances or the literal string `"Unknown error"`.
 */
export function buildToolErrorResult(error: unknown): CallToolResult {
    const httpResponse = pickHttpResponse(error);
    if (httpResponse) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        error: `HTTP ${httpResponse.status}${httpResponse.statusText ? `: ${httpResponse.statusText}` : ""}`,
                        details: httpResponse.data,
                    }),
                },
            ],
            isError: true,
        };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
    };
}

function pickHttpResponse(error: unknown): ToolHttpErrorResponse | undefined {
    if (!error || typeof error !== "object") return undefined;
    const candidate = (error as { response?: unknown }).response;
    if (!candidate || typeof candidate !== "object") return undefined;
    const r = candidate as Record<string, unknown>;
    if (typeof r.status !== "number") return undefined;
    return {
        status: r.status,
        statusText: typeof r.statusText === "string" ? r.statusText : undefined,
        data: r.data,
    };
}