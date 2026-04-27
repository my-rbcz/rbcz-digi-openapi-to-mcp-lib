import type { Endpoint } from "../types.js";

/**
 * Pick the JSON response schema off an endpoint's 200 response. Returns null
 * when the endpoint has no 200 response or no application/json content.
 */
export function pickResponseSchema(endpoint: Endpoint): unknown | null {
    const response200 = endpoint.responses["200"];
    const schema = response200?.content?.["application/json"]?.schema;
    return schema ?? null;
}

/**
 * Pascalize a path so filter operation keys match MCP tool names. Kept here
 * (rather than imported from tool/) to avoid a dependency cycle and to
 * emphasise that filter operation keys are identical to MCP tool names by
 * design.
 */
export function pascalizePath(path: string): string {
    return path
        .split("/")
        .filter(Boolean)
        .map((seg) => seg.replace(/[{}]/g, ""))
        .map((seg) => (seg.length > 0 ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg))
        .join("");
}
