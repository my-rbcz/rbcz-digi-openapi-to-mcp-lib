import type { OpenAPIV3 } from "openapi-types";
import type { Parameter } from "../types.js";

export function extractParameters(operation: OpenAPIV3.OperationObject): Parameter[] {
    const params = operation.parameters ?? [];
    return params.map((p) => toParameter(p as OpenAPIV3.ParameterObject));
}

function toParameter(p: OpenAPIV3.ParameterObject): Parameter {
    return {
        name: p.name,
        in: p.in as Parameter["in"],
        required: p.required ?? false,
        schema: p.schema,
        description: p.description,
    };
}