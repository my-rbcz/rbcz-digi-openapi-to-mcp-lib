import type { Endpoint, Protocol, SchemaFilterDefinition } from "../types.js";
import { extractAllowedFields } from "./extractAllowedFields.js";
import { extractCatalogMappings } from "../catalog/extractCatalogMappings.js";

export interface BuildSchemaFilterOptions {
    endpoint: Endpoint;
    backend: string;
    protocol: Protocol;
    description?: string;
}

/**
 * Build a SchemaFilterDefinition from a single endpoint's 200 response.
 *
 * Returns null when:
 *   - there is no 200 response, or
 *   - the 200 response has no application/json schema, or
 *   - the schema yields no allowed fields (typically an unresolved $ref).
 */
export function buildSchemaFilter(options: BuildSchemaFilterOptions): SchemaFilterDefinition | null {
    const { endpoint, backend, protocol, description } = options;

    const responseSchema = pickResponseSchema(endpoint);
    if (!responseSchema) return null;

    const allowedFields = extractAllowedFields(responseSchema);
    if (allowedFields.length === 0) return null;

    const catalogMappings = extractCatalogMappings(responseSchema);

    return {
        backend,
        protocol,
        operation: endpoint.path ? endpoint.method.toLowerCase() + pascalizePath(endpoint.path) : "",
        allowedFields,
        responseSchema,
        catalogMappings,
        description,
    };
}

function pickResponseSchema(endpoint: Endpoint): unknown | null {
    const response200 = endpoint.responses["200"];
    const schema = response200?.content?.["application/json"]?.schema;
    return schema ?? null;
}

// Kept inline rather than imported from tool/ to avoid a dependency cycle and to emphasise
// that filter operation keys are identical to MCP tool names by design.
function pascalizePath(path: string): string {
    return path
        .split("/")
        .filter(Boolean)
        .map((seg) => seg.replace(/[{}]/g, ""))
        .map((seg) => (seg.length > 0 ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg))
        .join("");
}