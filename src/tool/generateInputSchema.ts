import type { Endpoint } from "../types.js";
import { collectParamsByLocation } from "./collectPathProperties.js";
import { collectBodyProperties } from "./collectBodyProperties.js";

/**
 * Build the MCP tool input schema by merging path params, query params, and
 * request body properties into a single JSON Schema object.
 */
export function generateInputSchema(endpoint: Endpoint): Record<string, unknown> {
    const path = collectParamsByLocation(endpoint.parameters, "path");
    const query = collectParamsByLocation(endpoint.parameters, "query");
    const body = collectBodyProperties(endpoint.requestBody);

    const properties = { ...path.properties, ...query.properties, ...body.properties };
    const required = [...path.required, ...query.required, ...body.required];

    const schema: Record<string, unknown> = { type: "object", properties };
    if (required.length > 0) schema.required = required;
    return schema;
}