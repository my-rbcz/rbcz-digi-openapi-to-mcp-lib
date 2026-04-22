import type { RequestBody } from "../types.js";
import { cleanSchema } from "../schema/cleanSchema.js";
import type { CollectedProperties } from "./collectPathProperties.js";

const JSON_MEDIA_TYPE = "application/json";

/**
 * Merge a JSON request body into the tool's input schema.
 *
 * Object bodies with a `properties` block are flattened to the top level so the
 * tool input is a flat list of arguments; other body shapes are wrapped under a
 * synthetic `body` property for backwards compatibility.
 */
export function collectBodyProperties(requestBody: RequestBody | undefined): CollectedProperties {
    const empty: CollectedProperties = { properties: {}, required: [] };
    const bodySchema = pickJsonBodySchema(requestBody);
    if (!bodySchema) return empty;

    if (isObjectSchemaWithProperties(bodySchema)) {
        return flattenObjectBody(bodySchema);
    }
    return wrapNonObjectBody(bodySchema, requestBody!.required);
}

function pickJsonBodySchema(rb: RequestBody | undefined): Record<string, unknown> | null {
    const media = rb?.content?.[JSON_MEDIA_TYPE];
    if (!media || !media.schema || typeof media.schema !== "object") return null;
    return media.schema as Record<string, unknown>;
}

function isObjectSchemaWithProperties(schema: Record<string, unknown>): boolean {
    return schema.type === "object" && !!schema.properties && typeof schema.properties === "object";
}

function flattenObjectBody(schema: Record<string, unknown>): CollectedProperties {
    const result: CollectedProperties = { properties: {}, required: [] };
    const properties = schema.properties as Record<string, unknown>;
    for (const [name, propSchema] of Object.entries(properties)) {
        result.properties[name] = cleanSchema(propSchema);
    }
    if (Array.isArray(schema.required)) {
        result.required.push(...(schema.required as string[]));
    }
    return result;
}

function wrapNonObjectBody(schema: Record<string, unknown>, required: boolean): CollectedProperties {
    const result: CollectedProperties = { properties: {}, required: [] };
    result.properties.body = cleanSchema({
        ...schema,
        description: (schema.description as string | undefined) ?? "Request body",
    });
    if (required) result.required.push("body");
    return result;
}