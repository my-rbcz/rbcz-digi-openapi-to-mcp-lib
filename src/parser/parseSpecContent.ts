import yaml from "js-yaml";
import { OpenApiParseError } from "../errors.js";

/**
 * Parse a normalized spec string as JSON first, then YAML as a fallback.
 *
 * On failure, throws OpenApiParseError with both underlying errors attached.
 */
export function parseSpecContent(content: string): unknown {
    try {
        return JSON.parse(content);
    } catch (jsonError) {
        return parseAsYaml(content, jsonError);
    }
}

function parseAsYaml(content: string, jsonError: unknown): unknown {
    try {
        return yaml.load(content);
    } catch (yamlError) {
        throw new OpenApiParseError(
            `Failed to parse spec as JSON or YAML. JSON error: ${describe(jsonError)}. YAML error: ${describe(yamlError)}`,
            "parse",
            yamlError
        );
    }
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}