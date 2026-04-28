import { describe, it, expect } from "vitest";
import { planToolRequest } from "../../src/tool/planToolRequest.js";
import { ToolCallError } from "../../src/errors.js";
import type { Endpoint } from "../../src/types.js";

function ep(overrides: Partial<Endpoint>): Endpoint {
    return { method: "GET", path: "/x", parameters: [], responses: {}, ...overrides };
}

describe("planToolRequest", () => {
    it("plans a GET with path + query parameters", () => {
        const plan = planToolRequest({
            endpoint: ep({
                method: "GET",
                path: "/users/{id}",
                parameters: [
                    { name: "id", in: "path", required: true, schema: {} },
                    { name: "expand", in: "query", required: false, schema: {} },
                ],
            }),
            args: { id: "42", expand: "all" },
        });
        expect(plan.method).toBe("GET");
        expect(plan.path).toBe("/users/42");
        expect(plan.query).toEqual({ expand: "all" });
        expect(plan.body).toBeUndefined();
    });

    it("plans a POST with path + body", () => {
        const plan = planToolRequest({
            endpoint: ep({
                method: "POST",
                path: "/accounts/{accountId}/transactions",
                parameters: [{ name: "accountId", in: "path", required: true, schema: {} }],
                requestBody: { required: true, content: { "application/json": { schema: {} } } },
            }),
            args: { accountId: "abc", dateFrom: "2025-01-01" },
        });
        expect(plan.method).toBe("POST");
        expect(plan.path).toBe("/accounts/abc/transactions");
        expect(plan.body).toEqual({ dateFrom: "2025-01-01" });
    });

    it("URL-encodes path placeholder values", () => {
        const plan = planToolRequest({
            endpoint: ep({
                path: "/q/{term}",
                parameters: [{ name: "term", in: "path", required: true, schema: {} }],
            }),
            args: { term: "foo bar/baz" },
        });
        expect(plan.path).toBe("/q/foo%20bar%2Fbaz");
    });

    it("throws ToolCallError when a required path parameter is missing", () => {
        expect(() =>
            planToolRequest({
                endpoint: ep({
                    path: "/users/{id}",
                    parameters: [{ name: "id", in: "path", required: true, schema: {} }],
                }),
                args: {},
            }),
        ).toThrow(ToolCallError);
    });

    it("forwards Authorization / x-authorization headers, lower-cased", () => {
        const plan = planToolRequest({
            endpoint: ep({}),
            args: {},
            headers: { Authorization: "Bearer xyz", "X-Trace": "abc" },
        });
        expect(plan.headers).toEqual({ authorization: "Bearer xyz" });
    });

    it("preserves multi-value query parameters verbatim", () => {
        const plan = planToolRequest({
            endpoint: ep({
                parameters: [{ name: "ids", in: "query", required: false, schema: { type: "array" } }],
            }),
            args: { ids: ["a", "b"] },
        });
        expect(plan.query).toEqual({ ids: ["a", "b"] });
    });

    it("does not produce a body for body-bearing methods without a requestBody", () => {
        const plan = planToolRequest({
            endpoint: ep({ method: "POST", path: "/y" }),
            args: { stray: "x" },
        });
        expect(plan.body).toBeUndefined();
    });

    it("ignores the `headers` option when omitted (no auth headers forwarded)", () => {
        const plan = planToolRequest({ endpoint: ep({}), args: {} });
        expect(plan.headers).toEqual({});
    });

    it("handles header arrays from API Gateway", () => {
        const plan = planToolRequest({
            endpoint: ep({}),
            args: {},
            headers: { authorization: ["Bearer first", "Bearer second"] },
        });
        expect(plan.headers).toEqual({ authorization: "Bearer first" });
    });
});