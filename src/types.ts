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
    description?: string;
}

/**
 * Filter definition for the AJV-based stripper. Parallel to
 * `SchemaFilterDefinition` but without `allowedFields` — `applyAjvFilter`
 * derives stripping behaviour structurally from `responseSchema` via AJV's
 * `removeAdditional: "all"`.
 *
 * `responseSchema` holds the original (post-deref) schema so callers can
 * still pass it to `extractCatalogMappings`, exactly as with the legacy
 * filter type.
 */
export interface AjvFilterDefinition {
    backend: string;
    protocol: Protocol;
    operation: string;
    responseSchema: unknown;
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

/**
 * Per-segment plan for an outbound HTTP call to a backend, derived from an
 * Endpoint + tool arguments. The caller is responsible for prepending its
 * own base URL, executing the request, and applying any backend-specific
 * extras (e.g. x-apigw-api-id).
 */
export interface ToolRequestPlan {
    method: HttpMethod;
    path: string;
    query: Record<string, string | number | boolean | Array<string | number | boolean>>;
    headers: Record<string, string>;
    body?: unknown;
}

/** MCP CallToolResult shape (per spec 2025-06-18). */
export interface CallToolResult {
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}

/**
 * Minimal abstraction over an HTTP error the caller is willing to translate
 * into a CallToolResult. Compatible with axios's error.response, but does
 * not depend on axios.
 */
export interface ToolHttpErrorResponse {
    status: number;
    statusText?: string;
    data?: unknown;
}