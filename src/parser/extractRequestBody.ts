import type { OpenAPIV3 } from "openapi-types";
import type { RequestBody } from "../types.js";

export function extractRequestBody(operation: OpenAPIV3.OperationObject): RequestBody | undefined {
    if (!operation.requestBody) return undefined;

    const rb = operation.requestBody as OpenAPIV3.RequestBodyObject;
    return {
        required: rb.required ?? false,
        content: mapContent(rb.content ?? {}),
    };
}

function mapContent(content: Record<string, OpenAPIV3.MediaTypeObject>): Record<string, { schema: unknown }> {
    const out: Record<string, { schema: unknown }> = {};
    for (const [mediaType, media] of Object.entries(content)) {
        out[mediaType] = { schema: media.schema ?? {} };
    }
    return out;
}