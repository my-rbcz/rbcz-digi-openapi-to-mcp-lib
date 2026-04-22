import type { ErrorObject } from "ajv";
import type { ValidationError } from "../types.js";
import { enhanceErrorMessage } from "./enhanceErrorMessage.js";

export function formatValidationErrors(errors: ErrorObject[]): ValidationError[] {
    return errors.map(toValidationError);
}

function toValidationError(error: ErrorObject): ValidationError {
    return {
        field: normalizeFieldPath(error.instancePath || error.schemaPath),
        message: enhanceErrorMessage(error),
        value: error.data,
        keyword: error.keyword,
        schemaPath: error.schemaPath,
    };
}

function normalizeFieldPath(raw: string): string {
    const withoutLeadingSlash = raw.replace(/^\//, "");
    const dotted = withoutLeadingSlash.replace(/\//g, ".");
    return dotted || "root";
}