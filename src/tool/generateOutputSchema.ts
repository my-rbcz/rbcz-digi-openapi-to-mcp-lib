import type { Endpoint } from "../types.js";
import { cleanSchema } from "../schema/cleanSchema.js";
import { transformNullableSchema } from "../schema/transformNullableSchema.js";
import { pickSuccessResponse } from "./pickSuccessResponse.js";
import { extractJsonSchema } from "./extractJsonSchema.js";
import { wrapArraySchema } from "./wrapArraySchema.js";
import { generateToolName } from "./generateToolName.js";
import { generateArrayWrapperKey } from "./generateArrayWrapperKey.js";

const GENERIC_DESCRIPTION = "Response from API";

/**
 * Build the MCP tool output schema from an endpoint's success response:
 * pick 200/201/204 → extract JSON schema → clean x-* → nullable transform →
 * array wrap if needed.
 */
export function generateOutputSchema(endpoint: Endpoint): Record<string, unknown> {
    const success = pickSuccessResponse(endpoint.responses);
    if (!success) return genericObjectSchema(GENERIC_DESCRIPTION);

    const rawSchema = extractJsonSchema(success);
    if (!rawSchema) return genericObjectSchema(success.description || GENERIC_DESCRIPTION);

    const prepared = prepareSchema(rawSchema);
    if (isArraySchema(prepared)) {
        const wrapperKey = generateArrayWrapperKey(generateToolName(endpoint));
        return wrapArraySchema(prepared, wrapperKey);
    }
    return prepared;
}

function genericObjectSchema(description: string): Record<string, unknown> {
    return { type: "object", description };
}

function prepareSchema(rawSchema: unknown): Record<string, unknown> {
    const withoutDescription = stripTopLevelDescription(rawSchema);
    const cleaned = cleanSchema(withoutDescription) as Record<string, unknown>;
    return transformNullableSchema(cleaned) as Record<string, unknown>;
}

function stripTopLevelDescription(schema: unknown): Record<string, unknown> {
    const copy = { ...(schema as Record<string, unknown>) };
    delete copy.description;
    return copy;
}

function isArraySchema(schema: Record<string, unknown>): boolean {
    return schema.type === "array";
}