/**
 * Normalize a raw spec string: unify line endings and strip surrounding whitespace.
 * Required before handing the content to JSON.parse / js-yaml — otherwise a stray
 * BOM or trailing newline can trip up strict parsers.
 */
export function normalizeSpecContent(content: string): string {
    return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}