type HeaderBag = Record<string, string | string[] | undefined>;

const AUTH_HEADERS = ["authorization", "x-authorization"] as const;

/**
 * Copy `Authorization` / `x-authorization` from incoming request headers
 * into a fresh, lower-case-keyed object. Case-insensitive read; first
 * value wins for multi-value headers; empty strings are skipped.
 *
 * The caller adds Content-Type, x-apigw-api-id, etc. on top.
 */
export function forwardAuthHeaders(headers: HeaderBag): Record<string, string> {
    const lower = lowercaseKeys(headers);
    const out: Record<string, string> = {};
    for (const name of AUTH_HEADERS) {
        const value = lower[name];
        if (typeof value === "string" && value.length > 0) out[name] = value;
    }
    return out;
}

function lowercaseKeys(headers: HeaderBag): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(headers)) {
        if (v === undefined) continue;
        out[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    }
    return out;
}