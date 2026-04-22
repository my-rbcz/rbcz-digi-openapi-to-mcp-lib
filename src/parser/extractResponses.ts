import type { OpenAPIV3 } from "openapi-types";
import type { Response } from "../types.js";

export function extractResponses(operation: OpenAPIV3.OperationObject): Record<string, Response> {
    const out: Record<string, Response> = {};
    for (const [statusCode, response] of Object.entries(operation.responses)) {
        out[statusCode] = toResponse(response as OpenAPIV3.ResponseObject);
    }
    return out;
}

function toResponse(r: OpenAPIV3.ResponseObject): Response {
    return {
        description: r.description,
        content: r.content ? mapContent(r.content) : undefined,
    };
}

function mapContent(content: Record<string, OpenAPIV3.MediaTypeObject>): Record<string, { schema: unknown }> {
    const out: Record<string, { schema: unknown }> = {};
    for (const [mediaType, media] of Object.entries(content)) {
        out[mediaType] = { schema: media.schema ?? {} };
    }
    return out;
}