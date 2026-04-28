import type {
    AjvFilterDefinition,
    CallToolResult,
    CatalogMappings,
    CodeLookup,
    Endpoint,
    SchemaFilterDefinition,
    ToolRequestPlan,
} from "../types.js";
import type { ResponseValidator } from "../validation/ResponseValidator.js";
import { planToolRequest } from "./planToolRequest.js";
import { applyFilter } from "../filter/applyFilter.js";
import { applyAjvFilter } from "../filter/applyAjvFilter.js";
import { applyTranslations } from "../filter/applyTranslations.js";
import { wrapArrayForStructuredContent } from "./wrapArrayForStructuredContent.js";
import { buildToolResult } from "./buildToolResult.js";
import { buildToolErrorResult } from "./buildToolErrorResult.js";
import { generateToolName } from "./generateToolName.js";

export interface HttpResponseLike {
    status: number;
    data: unknown;
}

export interface ExecuteToolCallOptions {
    endpoint: Endpoint;
    args: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;

    /** Caller-supplied transport. Receives the plan; must return the parsed body. */
    httpClient: (plan: ToolRequestPlan) => Promise<HttpResponseLike>;

    /** Either filter type works. Pass null/undefined to skip filtering. */
    filter?: SchemaFilterDefinition | AjvFilterDefinition | null;

    /** Optional translation step. Caller supplies its own CodeLookup. */
    translations?: { mappings: CatalogMappings; lookup: CodeLookup } | null;

    /** Optional output validation. Validator does not throw. */
    validator?: ResponseValidator;
    outputSchema?: unknown;
}

/**
 * Optional thin orchestrator that wires the tool-call primitives against a
 * caller-supplied HTTP function. The caller can compose the primitives
 * themselves; this exists so the bridge can be a thin shim.
 *
 * Recoverable failures (HTTP errors raised by `httpClient`, programmer
 * errors thrown from `planToolRequest`) are returned as a `CallToolResult`
 * with `isError: true` via `buildToolErrorResult`.
 */
export async function executeToolCall(opts: ExecuteToolCallOptions): Promise<CallToolResult> {
    const toolName = generateToolName(opts.endpoint);
    try {
        const plan = planToolRequest({
            endpoint: opts.endpoint,
            args: opts.args,
            headers: opts.headers,
        });
        const response = await opts.httpClient(plan);

        let data: unknown = response.data;
        if (opts.filter) {
            data = isAjvFilter(opts.filter)
                ? applyAjvFilter(data, opts.filter)
                : applyFilter(data, opts.filter);
        }
        if (opts.translations) {
            data = applyTranslations(data, opts.translations.mappings, opts.translations.lookup);
        }
        const structuredContent = wrapArrayForStructuredContent(toolName, data);

        if (opts.validator && opts.outputSchema) {
            opts.validator.validateResponse(toolName, structuredContent, opts.outputSchema);
        }
        return buildToolResult(structuredContent);
    } catch (error) {
        return buildToolErrorResult(error);
    }
}

function isAjvFilter(f: SchemaFilterDefinition | AjvFilterDefinition): f is AjvFilterDefinition {
    return !("allowedFields" in f);
}