/**
 * Public type definitions for the openapi-to-mcp library.
 * All exported types are re-exported via src/index.ts.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";

export interface Parameter {
    name: string;
    in: "path" | "query" | "header" | "cookie";
    required: boolean;
    schema: unknown;
    description?: string;
}

export interface RequestBody {
    required: boolean;
    content: Record<string, { schema: unknown }>;
}

export interface Response {
    description: string;
    content?: Record<string, { schema: unknown }>;
}

/**
 * Execution model for a single REST endpoint. Produced by parseOpenApiSpec().
 */
export interface Endpoint {
    path: string;
    method: HttpMethod;
    operationId?: string;
    summary?: string;
    description?: string;
    parameters: Parameter[];
    requestBody?: RequestBody;
    responses: Record<string, Response>;
    baseUrl?: string;
}

export interface ParsedSpec {
    title: string;
    version: string;
    endpoints: Endpoint[];
    fullDocument: unknown;
}

/**
 * MCP tool definition — what is exposed to an MCP client via tools/list.
 */
export interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema: unknown;
    outputSchema?: unknown;
}

export type Protocol = "mcp" | "rest";

export interface SchemaFilterDefinition {
    backend: string;
    protocol: Protocol;
    operation: string;
    allowedFields: string[];
    responseSchema: unknown;
    catalogMappings: CatalogMappings;
    description?: string;
}

/**
 * Mapping from dot-notation JSON path to catalog name.
 * Example: { "currencyFolders.status": "CURRENCYFOLDERSTATUS" }
 */
export type CatalogMappings = Record<string, string>;

/**
 * User-supplied value translator. Called by applyTranslations() for every
 * primitive field whose path matches a catalog mapping.
 */
export type CodeLookup = (catalogName: string, value: string | number) => string;

export interface ValidationError {
    field: string;
    message: string;
    value: unknown;
    keyword?: string;
    schemaPath?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors?: ValidationError[];
    summary?: string;
}

/**
 * Optional logger interface. Inject to observe library internals; omit for silent operation.
 */
export interface Logger {
    debug(msg: string, meta?: unknown): void;
    info(msg: string, meta?: unknown): void;
    warn(msg: string, meta?: unknown): void;
    error(msg: string, meta?: unknown): void;
}

/**
 * Internal traversal context used by filter + translation helpers.
 */
export interface FilterContext {
    schema?: unknown;
    path?: string;
}