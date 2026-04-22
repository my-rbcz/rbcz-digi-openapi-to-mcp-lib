import type { Endpoint, MCPToolDefinition } from "../types.js";
import { generateToolName } from "./generateToolName.js";
import { generateInputSchema } from "./generateInputSchema.js";
import { generateOutputSchema } from "./generateOutputSchema.js";

/**
 * High-level helper: Endpoint → MCPToolDefinition (name + description + input + output).
 */
export function buildToolDefinition(endpoint: Endpoint): MCPToolDefinition {
    return {
        name: generateToolName(endpoint),
        description: endpoint.description ?? endpoint.summary ?? `${endpoint.method} ${endpoint.path}`,
        inputSchema: generateInputSchema(endpoint),
        outputSchema: generateOutputSchema(endpoint),
    };
}