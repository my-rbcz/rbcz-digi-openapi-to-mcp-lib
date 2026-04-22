/**
 * A catalog name is valid when it's a non-empty string without comment markers
 * and not terminating with a dot (which typically indicates an unfinished edit).
 */
export function isValidCatalogName(raw: unknown): raw is string {
    if (typeof raw !== "string") return false;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.includes("#")) return false;
    if (trimmed.endsWith(".")) return false;
    return true;
}