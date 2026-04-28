// ─── Types ────────────────────────────────────────────────────────────
export type {
    Endpoint,
    Parameter,
    RequestBody,
    Response,
    ParsedSpec,
    HttpMethod,
    MCPToolDefinition,
    SchemaFilterDefinition,
    AjvFilterDefinition,
    FilterContext,
    CatalogMappings,
    CodeLookup,
    ValidationResult,
    ValidationError,
    Logger,
    Protocol,
    ToolRequestPlan,
    CallToolResult,
    ToolHttpErrorResponse,
} from "./types.js";

// ─── Errors ───────────────────────────────────────────────────────────
export { OpenApiParseError, SchemaFilterError, ToolCallError } from "./errors.js";

// ─── Parsing ──────────────────────────────────────────────────────────
export { parseOpenApiSpec } from "./parser/parseOpenApiSpec.js";
export type { SpecInput, ParseOptions } from "./parser/parseOpenApiSpec.js";
export { extractEndpoints } from "./parser/extractEndpoints.js";

// ─── Tool generation ──────────────────────────────────────────────────
export { generateToolName } from "./tool/generateToolName.js";
export { generateInputSchema } from "./tool/generateInputSchema.js";
export { generateOutputSchema } from "./tool/generateOutputSchema.js";
export { generateArrayWrapperKey } from "./tool/generateArrayWrapperKey.js";
export { buildToolDefinition } from "./tool/buildToolDefinition.js";

// ─── Schema utilities ─────────────────────────────────────────────────
export { cleanSchema } from "./schema/cleanSchema.js";
export { transformNullableSchema } from "./schema/transformNullableSchema.js";

// ─── Catalogs ─────────────────────────────────────────────────────────
export { extractCatalogNames } from "./catalog/extractCatalogNames.js";
export { extractCatalogMappings } from "./catalog/extractCatalogMappings.js";

// ─── Filtering (legacy, allowedFields-based) ──────────────────────────
export { buildSchemaFilter } from "./filter/buildSchemaFilter.js";
export type { BuildSchemaFilterOptions } from "./filter/buildSchemaFilter.js";
export { applyFilter } from "./filter/applyFilter.js";
export type { ApplyFilterOptions, FilterErrorMode } from "./filter/applyFilter.js";
export { applyTranslations } from "./filter/applyTranslations.js";
export { SchemaFilterRegistry } from "./filter/SchemaFilterRegistry.js";

// ─── Filtering (AJV-based, parallel) ──────────────────────────────────
export { buildAjvFilter } from "./filter/buildAjvFilter.js";
export type { BuildAjvFilterOptions } from "./filter/buildAjvFilter.js";
export { applyAjvFilter } from "./filter/applyAjvFilter.js";
export type { ApplyAjvFilterOptions } from "./filter/applyAjvFilter.js";
export { AjvFilterRegistry } from "./filter/AjvFilterRegistry.js";

// ─── Validation ───────────────────────────────────────────────────────
export { ResponseValidator } from "./validation/ResponseValidator.js";
export type { ResponseValidatorOptions } from "./validation/ResponseValidator.js";

// ─── Tool execution ───────────────────────────────────────────────────
export { ToolRegistry } from "./tool/ToolRegistry.js";
export { splitToolArguments } from "./tool/splitToolArguments.js";
export type { SplitArguments } from "./tool/splitToolArguments.js";
export { applyPathParameters } from "./tool/applyPathParameters.js";
export { serializeQueryParameters } from "./tool/serializeQueryParameters.js";
export type { QueryArrayStyle } from "./tool/serializeQueryParameters.js";
export { forwardAuthHeaders } from "./tool/forwardAuthHeaders.js";
export { planToolRequest } from "./tool/planToolRequest.js";
export type { PlanToolRequestOptions } from "./tool/planToolRequest.js";
export { wrapArrayForStructuredContent } from "./tool/wrapArrayForStructuredContent.js";
export { buildToolResult } from "./tool/buildToolResult.js";
export { buildToolErrorResult } from "./tool/buildToolErrorResult.js";
export { executeToolCall } from "./tool/executeToolCall.js";
export type { ExecuteToolCallOptions, HttpResponseLike } from "./tool/executeToolCall.js";