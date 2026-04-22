import type { Response } from "../types.js";

const SUCCESS_CODES = ["200", "201", "204"] as const;

/**
 * Pick the first success response defined on an endpoint: 200 → 201 → 204.
 */
export function pickSuccessResponse(responses: Record<string, Response>): Response | undefined {
    for (const code of SUCCESS_CODES) {
        const response = responses[code];
        if (response) return response;
    }
    return undefined;
}