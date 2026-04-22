import type { Parameter } from "../types.js";
import { cleanSchema } from "../schema/cleanSchema.js";

export interface CollectedProperties {
    properties: Record<string, unknown>;
    required: string[];
}

export function collectParamsByLocation(parameters: Parameter[], location: Parameter["in"]): CollectedProperties {
    const result: CollectedProperties = { properties: {}, required: [] };
    for (const param of parameters) {
        if (param.in !== location) continue;
        result.properties[param.name] = cleanSchema({
            ...(param.schema as Record<string, unknown>),
            description: param.description,
        });
        if (param.required) result.required.push(param.name);
    }
    return result;
}