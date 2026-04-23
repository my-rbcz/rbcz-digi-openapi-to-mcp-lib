/**
 * Normalize a raw spec string: unify line endings and strip surrounding whitespace.
 * Required before handing the content to JSON.parse / js-yaml — otherwise a stray
 * BOM (Byte Order Mark) or trailing newline can trip up strict parsers.
 */
export function normalizeSpecContent(content: string): string {
    // Convert Windows line endings (CRLF, \r\n) into Unix line endings (LF, \n)
    // Convert any remaining standalone \r (old Mac style) into \n
    return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}