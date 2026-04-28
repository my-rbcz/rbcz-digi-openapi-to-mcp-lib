import { ToolCallError } from "../errors.js";

/**
 * Substitute `{name}` placeholders in a path template with URL-encoded
 * values from `params`. Throws `ToolCallError` if a referenced parameter
 * is missing or null.
 */
export function applyPathParameters(path: string, params: Record<string, unknown>): string {
    return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const value = params[name];
        if (value === undefined || value === null) {
            throw new ToolCallError(`Missing path parameter: ${name}`);
        }
        return encodeURIComponent(String(value));
    });
}