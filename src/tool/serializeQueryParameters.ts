type QueryValue = string | number | boolean | Array<string | number | boolean>;

export type QueryArrayStyle = "repeat" | "csv";

/**
 * Serialise a parameter map into a query string. `undefined` values are
 * skipped. Arrays are either repeated (`key=a&key=b`, default) or joined
 * with commas (`key=a,b`). Keys and values are URL-encoded.
 *
 * Returns `""` for empty input. The returned string never includes a
 * leading `?` — the caller decides how to splice it onto a URL.
 */
export function serializeQueryParameters(
    params: Record<string, QueryValue | undefined>,
    style: QueryArrayStyle = "repeat",
): string {
    const parts: string[] = [];
    for (const [key, raw] of Object.entries(params)) {
        if (raw === undefined) continue;
        if (Array.isArray(raw)) {
            if (style === "csv") {
                parts.push(
                    `${encodeURIComponent(key)}=${raw.map((v) => encodeURIComponent(String(v))).join(",")}`,
                );
            } else {
                for (const v of raw) {
                    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
                }
            }
        } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(raw))}`);
        }
    }
    return parts.join("&");
}