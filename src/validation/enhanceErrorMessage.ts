import type { ErrorObject } from "ajv";

/**
 * Turn AJV's raw error messages into human-friendly strings for the tricky keywords.
 * Everything else falls through to the original AJV message.
 */
export function enhanceErrorMessage(error: ErrorObject): string {
    switch (error.keyword) {
        case "required":
            return `Missing required field: ${(error.params as Record<string, unknown>).missingProperty}`;
        case "type":
            return `Expected type '${(error.params as Record<string, unknown>).type}' but got '${typeof error.data}'`;
        case "format":
            return `Invalid format for '${(error.params as Record<string, unknown>).format}': ${error.message ?? ""}`;
        case "enum": {
            const allowed = (error.params as Record<string, unknown>).allowedValues;
            return `Value must be one of: ${Array.isArray(allowed) ? allowed.join(", ") : String(allowed)}`;
        }
        case "minimum":
        case "maximum": {
            const limit = (error.params as Record<string, unknown>).limit;
            return `Value ${error.data} violates ${error.keyword} constraint: ${limit}`;
        }
        default:
            return error.message ?? "Validation failed";
    }
}