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
    FilterContext,
    CatalogMappings,
    CodeLookup,
    ValidationResult,
    ValidationError,
    Logger,
    Protocol,
} from "./types.js";

// ─── Errors ───────────────────────────────────────────────────────────
export { OpenApiParseError, SchemaFilterError } from "./errors.js";

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

// ─── Filtering ────────────────────────────────────────────────────────
export { buildSchemaFilter } from "./filter/buildSchemaFilter.js";
export type { BuildSchemaFilterOptions } from "./filter/buildSchemaFilter.js";
export { applyFilter } from "./filter/applyFilter.js";
export type { ApplyFilterOptions, FilterErrorMode } from "./filter/applyFilter.js";
export { applyTranslations } from "./filter/applyTranslations.js";
export { SchemaFilterRegistry } from "./filter/SchemaFilterRegistry.js";

// ─── Validation ───────────────────────────────────────────────────────
export { ResponseValidator } from "./validation/ResponseValidator.js";
export type { ResponseValidatorOptions } from "./validation/ResponseValidator.js";