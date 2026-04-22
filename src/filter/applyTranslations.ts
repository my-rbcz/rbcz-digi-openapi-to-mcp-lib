import type { CatalogMappings, CodeLookup } from "../types.js";
import { SchemaFilterError } from "../errors.js";
import { translateData } from "./translateData.js";
import type { ApplyFilterOptions } from "./applyFilter.js";

/**
 * Apply code-list translations to already-filtered data.
 *
 * No mappings → data is returned untouched.
 */
export function applyTranslations(data: unknown, mappings: CatalogMappings, lookup: CodeLookup, options: ApplyFilterOptions = {}): unknown {
    if (!mappings || Object.keys(mappings).length === 0) return data;

    const mode = options.onError ?? "throw";
    try {
        return translateData(data, mappings, lookup);
    } catch (error) {
        if (mode === "passthrough") return data;
        throw new SchemaFilterError(`Failed to translate data: ${describe(error)}`, error);
    }
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}