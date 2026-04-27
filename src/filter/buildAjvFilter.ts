import type { AjvFilterDefinition, Endpoint, Protocol } from "../types.js";
import { pickResponseSchema, pascalizePath } from "./responseSchemaUtils.js";

export interface BuildAjvFilterOptions {
    endpoint: Endpoint;
    backend: string;
    protocol: Protocol;
    description?: string;
}

/**
 * Build an AjvFilterDefinition from a single endpoint's 200 response.
 *
 * Returns null when:
 *   - there is no 200 response, or
 *   - the 200 response has no application/json schema.
 *
 * Unlike `buildSchemaFilter`, this builder does NOT inspect the schema's
 * field set — AJV decides what to keep at runtime via `removeAdditional`.
 *
 * Catalog mappings are NOT computed here — call `extractCatalogMappings`
 * on the resulting `responseSchema` when you need them, exactly as you
 * would with `buildSchemaFilter`.
 */
export function buildAjvFilter(options: BuildAjvFilterOptions): AjvFilterDefinition | null {
    const { endpoint, backend, protocol, description } = options;

    const responseSchema = pickResponseSchema(endpoint);
    if (!responseSchema) return null;

    return {
        backend,
        protocol,
        operation: endpoint.path ? endpoint.method.toLowerCase() + pascalizePath(endpoint.path) : "",
        responseSchema,
        description,
    };
}
