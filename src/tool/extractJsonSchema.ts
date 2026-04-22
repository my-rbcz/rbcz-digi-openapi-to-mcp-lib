import type { Response } from "../types.js";

const JSON_MEDIA_TYPE = "application/json";

/**
 * Extract the application/json response schema from a Response, returning null
 * when there is no JSON content or no schema declared.
 */
export function extractJsonSchema(response: Response): unknown | null {
    const media = response.content?.[JSON_MEDIA_TYPE];
    if (!media || !media.schema) return null;
    return media.schema;
}