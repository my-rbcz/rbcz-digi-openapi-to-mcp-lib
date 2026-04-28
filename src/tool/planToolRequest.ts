import type { Endpoint, ToolRequestPlan } from "../types.js";
import { splitToolArguments } from "./splitToolArguments.js";
import { applyPathParameters } from "./applyPathParameters.js";
import { forwardAuthHeaders } from "./forwardAuthHeaders.js";

export interface PlanToolRequestOptions {
    endpoint: Endpoint;
    args: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;
}

/**
 * Compose `splitToolArguments` + `applyPathParameters` + `forwardAuthHeaders`
 * into a complete `ToolRequestPlan`. No I/O — the caller still owns the HTTP
 * client and any backend-specific extras (base URL, x-apigw-api-id, etc.).
 *
 * Throws `ToolCallError` when a path placeholder is unsatisfied.
 */
export function planToolRequest(options: PlanToolRequestOptions): ToolRequestPlan {
    const { endpoint, args, headers = {} } = options;
    const split = splitToolArguments(endpoint, args);
    const path = applyPathParameters(endpoint.path, split.path);
    const forwarded = forwardAuthHeaders(headers);
    const query = split.query as ToolRequestPlan["query"];
    return {
        method: endpoint.method,
        path,
        query,
        headers: forwarded,
        body: split.body,
    };
}