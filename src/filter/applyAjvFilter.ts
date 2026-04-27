import type { ValidateFunction } from "ajv";
import type { AjvFilterDefinition } from "../types.js";
import { SchemaFilterError, describeError } from "../errors.js";
import { prepareSchemaForAjv } from "./prepareSchemaForAjv.js";
import { getFilterAjv } from "./createFilterAjv.js";
import type { FilterErrorMode } from "./applyFilter.js";

export interface ApplyAjvFilterOptions {
    onError?: FilterErrorMode;
}

const validatorCache = new WeakMap<AjvFilterDefinition, ValidateFunction>();

/**
 * Strip undeclared fields from `data` using the endpoint's response schema
 * via AJV's `removeAdditional: true`. Parallel to `applyFilter`.
 *
 * - null / undefined pass through.
 * - Input is cloned via `structuredClone` before AJV mutates it.
 * - The schema is pre-processed once per filter (and cached) by
 *   `prepareSchemaForAjv` — see that file for the lowering and lock rules.
 *
 * By default internal errors bubble up as `SchemaFilterError`. Pass
 * `{ onError: "passthrough" }` to mirror the legacy fail-safe behaviour.
 */
export function applyAjvFilter(data: unknown, filter: AjvFilterDefinition, options: ApplyAjvFilterOptions = {}): unknown {
    const errorMode = options.onError ?? "throw";

    if (data === null || data === undefined) return data;

    try {
        const validate = getValidator(filter);
        const cloned = structuredClone(data);
        validate(cloned);
        return cloned;
    } catch (error) {
        if (errorMode === "passthrough") return data;
        throw new SchemaFilterError(`Failed to filter data for ${filterKey(filter)}: ${describeError(error)}`, error);
    }
}

function getValidator(filter: AjvFilterDefinition): ValidateFunction {
    const cached = validatorCache.get(filter);
    if (cached) return cached;
    const prepared = prepareSchemaForAjv(filter.responseSchema);
    const compiled = getFilterAjv().compile(prepared as object);
    validatorCache.set(filter, compiled);
    return compiled;
}

function filterKey(f: AjvFilterDefinition): string {
    return `${f.backend}:${f.protocol}:${f.operation}`;
}
