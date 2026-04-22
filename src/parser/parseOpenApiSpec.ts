import type { OpenAPIV3 } from "openapi-types";
import { OpenApiParseError, noopLogger } from "../errors.js";
import type { Logger, ParsedSpec } from "../types.js";
import { normalizeSpecContent } from "./normalizeSpecContent.js";
import { parseSpecContent } from "./parseSpecContent.js";
import { dereferenceSpec } from "./dereferenceSpec.js";
import { extractEndpoints } from "./extractEndpoints.js";

export type SpecInput = string | Record<string, unknown>;

export interface ParseOptions {
    logger?: Logger;
}

/**
 * Parse an OpenAPI spec (string or pre-parsed object) and produce an execution model.
 *
 * Steps: normalize → JSON/YAML parse → dereference → extract endpoints.
 *
 * All errors are wrapped as OpenApiParseError with a `.stage` discriminator.
 */
export async function parseOpenApiSpec(input: SpecInput, options: ParseOptions = {}): Promise<ParsedSpec> {
    const logger = options.logger ?? noopLogger();

    const parsed = resolveInput(input);
    logger.debug("Dereferencing OpenAPI spec");

    const api = await dereferenceSpec(parsed);
    logger.info(`Parsed OpenAPI spec: ${api.info?.title} v${api.info?.version}`);

    try {
        const endpoints = extractEndpoints(api);
        logger.info(`Extracted ${endpoints.length} endpoint(s)`);
        return {
            title: api.info?.title ?? "",
            version: api.info?.version ?? "",
            endpoints,
            fullDocument: api,
        };
    } catch (error) {
        throw new OpenApiParseError(`Failed to extract endpoints: ${describe(error)}`, "extract", error);
    }
}

function resolveInput(input: SpecInput): unknown {
    if (typeof input === "string") {
        return parseSpecContent(normalizeSpecContent(input));
    }
    if (input && typeof input === "object") {
        return input;
    }
    throw new OpenApiParseError("Spec input must be a string or an object", "parse");
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// Re-export for consumers that want the OpenAPIV3 type without importing it directly.
export type { OpenAPIV3 };