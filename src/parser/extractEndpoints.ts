import type { OpenAPIV3 } from "openapi-types";
import type { Endpoint, HttpMethod } from "../types.js";
import { extractParameters } from "./extractParameters.js";
import { extractRequestBody } from "./extractRequestBody.js";
import { extractResponses } from "./extractResponses.js";

const METHODS = ["get", "post", "put", "delete", "patch", "options", "head"] as const;
type MethodKey = (typeof METHODS)[number];

/**
 * Walk api.paths and build one Endpoint per (path, method) pair. Missing methods are skipped.
 */
export function extractEndpoints(api: OpenAPIV3.Document): Endpoint[] {
    const baseUrl = api.servers?.[0]?.url ?? "";
    const endpoints: Endpoint[] = [];

    for (const [path, pathItem] of Object.entries(api.paths ?? {})) {
        if (!pathItem) continue;
        for (const method of METHODS) {
            const operation = pathItem[method];
            if (!operation) continue;
            endpoints.push(buildEndpoint(path, method, operation as OpenAPIV3.OperationObject, baseUrl));
        }
    }

    return endpoints;
}

function buildEndpoint(path: string, method: MethodKey, operation: OpenAPIV3.OperationObject, baseUrl: string): Endpoint {
    return {
        path,
        method: method.toUpperCase() as HttpMethod,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        parameters: extractParameters(operation),
        requestBody: extractRequestBody(operation),
        responses: extractResponses(operation),
        baseUrl,
    };
}