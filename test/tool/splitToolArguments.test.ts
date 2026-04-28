import { describe, it, expect } from "vitest";
import { splitToolArguments } from "../../src/tool/splitToolArguments.js";
import type { Endpoint } from "../../src/types.js";

function makeEndpoint(overrides: Partial<Endpoint>): Endpoint {
    return {
        method: "GET",
        path: "/x",
        parameters: [],
        responses: {},
        ...overrides,
    };
}

describe("splitToolArguments", () => {
    it("buckets path-only args", () => {
        const ep = makeEndpoint({
            path: "/users/{id}",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        });
        const out = splitToolArguments(ep, { id: "42" });
        expect(out.path).toEqual({ id: "42" });
        expect(out.query).toEqual({});
        expect(out.body).toBeUndefined();
    });

    it("buckets query-only args", () => {
        const ep = makeEndpoint({
            parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
        });
        const out = splitToolArguments(ep, { limit: 10 });
        expect(out.query).toEqual({ limit: 10 });
        expect(out.body).toBeUndefined();
    });

    it("uses leftover args as body for POST with requestBody", () => {
        const ep = makeEndpoint({
            method: "POST",
            requestBody: { required: true, content: { "application/json": { schema: {} } } },
        });
        const out = splitToolArguments(ep, { dateFrom: "2025-01-01", dateTo: "2025-02-01" });
        expect(out.body).toEqual({ dateFrom: "2025-01-01", dateTo: "2025-02-01" });
    });

    it("mixed: path + query + body — body excludes parameter keys", () => {
        const ep = makeEndpoint({
            method: "POST",
            path: "/accounts/{accountId}/transactions",
            parameters: [
                { name: "accountId", in: "path", required: true, schema: { type: "string" } },
                { name: "limit", in: "query", required: false, schema: { type: "integer" } },
            ],
            requestBody: { required: true, content: { "application/json": { schema: {} } } },
        });
        const out = splitToolArguments(ep, {
            accountId: "abc",
            limit: 50,
            dateFrom: "2025-01-01",
            dateTo: "2025-02-01",
        });
        expect(out.path).toEqual({ accountId: "abc" });
        expect(out.query).toEqual({ limit: 50 });
        expect(out.body).toEqual({ dateFrom: "2025-01-01", dateTo: "2025-02-01" });
    });

    it("skips undefined values in args", () => {
        const ep = makeEndpoint({
            method: "POST",
            parameters: [
                { name: "limit", in: "query", required: false, schema: { type: "integer" } },
            ],
            requestBody: { required: true, content: { "application/json": { schema: {} } } },
        });
        const out = splitToolArguments(ep, { limit: undefined, foo: undefined, bar: 1 });
        expect(out.query).toEqual({});
        expect(out.body).toEqual({ bar: 1 });
    });

    it("preserves array values verbatim", () => {
        const ep = makeEndpoint({
            parameters: [{ name: "ids", in: "query", required: false, schema: { type: "array" } }],
        });
        const out = splitToolArguments(ep, { ids: ["a", "b", "c"] });
        expect(out.query).toEqual({ ids: ["a", "b", "c"] });
    });

    it("does not produce a body for GET / DELETE / HEAD even with leftover args", () => {
        for (const method of ["GET", "DELETE", "HEAD"] as const) {
            const ep = makeEndpoint({
                method,
                requestBody: { required: false, content: { "application/json": { schema: {} } } },
            });
            const out = splitToolArguments(ep, { stray: "x" });
            expect(out.body).toBeUndefined();
        }
    });

    it("does not produce a body when endpoint has no requestBody", () => {
        const ep = makeEndpoint({ method: "POST" });
        const out = splitToolArguments(ep, { foo: 1 });
        expect(out.body).toBeUndefined();
    });

    it("returns empty body when only parameter keys are present", () => {
        const ep = makeEndpoint({
            method: "POST",
            parameters: [{ name: "id", in: "path", required: true, schema: {} }],
            path: "/x/{id}",
            requestBody: { required: true, content: { "application/json": { schema: {} } } },
        });
        const out = splitToolArguments(ep, { id: "1" });
        expect(out.body).toBeUndefined();
    });

    it("sorts header and cookie params into their own buckets", () => {
        const ep = makeEndpoint({
            parameters: [
                { name: "X-Trace", in: "header", required: false, schema: {} },
                { name: "session", in: "cookie", required: false, schema: {} },
            ],
        });
        const out = splitToolArguments(ep, { "X-Trace": "abc", session: "xyz" });
        expect(out.header).toEqual({ "X-Trace": "abc" });
        expect(out.cookie).toEqual({ session: "xyz" });
    });
});