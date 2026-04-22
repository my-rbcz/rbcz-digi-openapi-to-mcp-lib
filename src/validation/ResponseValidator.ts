import type { Ajv, ValidateFunction } from "ajv";
import type { Logger, ValidationError, ValidationResult } from "../types.js";
import { noopLogger } from "../errors.js";
import { transformNullableSchema } from "../schema/transformNullableSchema.js";
import { createAjv } from "./createAjv.js";
import { formatValidationErrors } from "./formatValidationErrors.js";
import { summarizeErrors } from "./summarizeErrors.js";

export interface ResponseValidatorOptions {
    logger?: Logger;
}

/**
 * Validates tool responses against JSON schemas derived from OpenAPI specs.
 *
 * Behaviour:
 *   - Returns `{ valid: true }` when the schema lacks `properties` (nothing to check).
 *   - Schemas pass through `transformNullableSchema` before compilation so that
 *     OpenAPI `nullable: true` markers validate correctly.
 *   - Compiled validators are cached by tool name.
 *   - Never throws for validation failures. Unexpected errors (e.g. schema
 *     compile failures) are reported as a single synthetic error.
 */
export class ResponseValidator {
    private readonly ajv: Ajv;
    private readonly logger: Logger;
    private readonly validatorCache: Map<string, ValidateFunction> = new Map();

    constructor(options: ResponseValidatorOptions = {}) {
        this.ajv = createAjv();
        this.logger = options.logger ?? noopLogger();
    }

    validateResponse(toolName: string, responseData: unknown, outputSchema: unknown): ValidationResult {
        if (!hasProperties(outputSchema)) {
            this.logger.debug(`No output schema properties for tool ${toolName} — skipping validation`);
            return { valid: true };
        }

        try {
            const validate = this.getValidator(toolName, outputSchema);
            return runValidation(validate, responseData);
        } catch (error) {
            return synthesizeSchemaError(error);
        }
    }

    clearCache(): void {
        this.validatorCache.clear();
    }

    getCacheStats(): { size: number; toolNames: string[] } {
        return {
            size: this.validatorCache.size,
            toolNames: Array.from(this.validatorCache.keys()),
        };
    }

    private getValidator(toolName: string, schema: unknown): ValidateFunction {
        const cached = this.validatorCache.get(toolName);
        if (cached) return cached;

        const transformed = transformNullableSchema(schema);
        const validate = this.ajv.compile(transformed as Record<string, unknown>);
        this.validatorCache.set(toolName, validate);
        return validate;
    }
}

function hasProperties(schema: unknown): boolean {
    if (!schema || typeof schema !== "object") return false;
    const props = (schema as Record<string, unknown>).properties;
    return !!props && typeof props === "object";
}

function runValidation(validate: ValidateFunction, data: unknown): ValidationResult {
    const valid = validate(data);
    if (valid) return { valid: true };
    const errors: ValidationError[] = formatValidationErrors(validate.errors ?? []);
    return { valid: false, errors, summary: summarizeErrors(errors) };
}

function synthesizeSchemaError(error: unknown): ValidationResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
        valid: false,
        errors: [
            {
                field: "schema",
                message: `Validation error: ${message}`,
                value: undefined,
            },
        ],
        summary: "Schema validation error occurred",
    };
}