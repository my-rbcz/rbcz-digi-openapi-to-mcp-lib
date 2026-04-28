import type { Endpoint } from "../types.js";

export interface SplitArguments {
    path: Record<string, unknown>;
    query: Record<string, unknown>;
    header: Record<string, unknown>;
    cookie: Record<string, unknown>;
    body: Record<string, unknown> | undefined;
}

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH"]);

/**
 * Categorise tool arguments into path, query, header, cookie buckets using
 * `endpoint.parameters[].in`. Whatever remains becomes the request body for
 * methods that accept one (POST/PUT/PATCH with a `requestBody`).
 *
 * Pure: returns fresh objects, never mutates `args`. `undefined` values are
 * skipped throughout. Body field names that collide with parameter names are
 * intentionally dropped — parameter names own those keys.
 */
export function splitToolArguments(endpoint: Endpoint, args: Record<string, unknown>): SplitArguments {
    const out: SplitArguments = { path: {}, query: {}, header: {}, cookie: {}, body: undefined };
    const handled = new Set<string>();

    for (const p of endpoint.parameters) {
        if (args[p.name] === undefined) continue;
        out[p.in][p.name] = args[p.name];
        handled.add(p.name);
    }

    if (endpoint.requestBody && METHODS_WITH_BODY.has(endpoint.method.toUpperCase())) {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args)) {
            if (handled.has(k) || v === undefined) continue;
            body[k] = v;
        }
        if (Object.keys(body).length > 0) out.body = body;
    }
    return out;
}