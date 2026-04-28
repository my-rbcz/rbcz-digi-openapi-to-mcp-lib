import { describe, it, expect, vi } from "vitest";
import { executeToolCall } from "../../src/tool/executeToolCall.js";
import type {
    AjvFilterDefinition,
    Endpoint,
    SchemaFilterDefinition,
    ToolRequestPlan,
} from "../../src/types.js";

const objectEndpoint: Endpoint = {
    method: "GET",
    path: "/users/{id}",
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: {},
};

const arrayEndpoint: Endpoint = {
    method: "GET",
    path: "/clients",
    parameters: [],
    responses: {},
};

const objectFilter: SchemaFilterDefinition = {
    backend: "mch",
    protocol: "mcp",
    operation: "getUsersId",
    allowedFields: ["id", "name"],
    responseSchema: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" } },
    },
};

const ajvFilter: AjvFilterDefinition = {
    backend: "mch",
    protocol: "mcp",
    operation: "getUsersId",
    responseSchema: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" } },
    },
};

describe("executeToolCall", () => {
    it("happy path: plans, calls, filters, formats an object response", async () => {
        const httpClient = vi.fn(async (_plan: ToolRequestPlan) => ({
            status: 200,
            data: { id: "42", name: "Alice", junk: "no" },
        }));
        const result = await executeToolCall({
            endpoint: objectEndpoint,
            args: { id: "42" },
            httpClient,
            // filter: objectFilter,
            filter: ajvFilter,
        });
        expect(result.isError).toBeUndefined();
        expect(result.structuredContent).toEqual({ id: "42", name: "Alice" });
        expect(httpClient).toHaveBeenCalledTimes(1);
        const plan = httpClient.mock.calls[0]![0];
        expect(plan.path).toBe("/users/42");
    });

    it("wraps array responses under the derived key", async () => {
        const httpClient = async () => ({
            status: 200,
            data: [{ id: "1" }, { id: "2" }],
        });
        const result = await executeToolCall({
            endpoint: arrayEndpoint,
            args: {},
            httpClient,
        });
        expect(result.structuredContent).toEqual({ clients: [{ id: "1" }, { id: "2" }] });
    });

    it("uses the AJV filter path when an AjvFilterDefinition is provided", async () => {
        const httpClient = async () => ({
            status: 200,
            data: { id: "42", name: "Alice", junk: "no" },
        });
        const result = await executeToolCall({
            endpoint: objectEndpoint,
            args: { id: "42" },
            httpClient,
            filter: ajvFilter,
        });
        expect(result.structuredContent).toEqual({ id: "42", name: "Alice" });
    });

    it("applies translations when provided", async () => {
        const httpClient = async () => ({ status: 200, data: { id: "42", name: "Alice" } });
        const result = await executeToolCall({
            endpoint: objectEndpoint,
            args: { id: "42" },
            httpClient,
            translations: {
                mappings: { name: "USER_NAME" },
                lookup: (cat, v) => `${cat}#${v}`,
            },
        });
        expect(result.structuredContent).toEqual({ id: "42", name: "USER_NAME#Alice" });
    });

    it("returns isError when the http client rejects with an axios-shape", async () => {
        const httpClient = async (): Promise<never> => {
            throw {
                response: { status: 502, statusText: "Bad Gateway", data: { code: "X" } },
            };
        };
        const result = await executeToolCall({
            endpoint: objectEndpoint,
            args: { id: "42" },
            httpClient,
        });
        expect(result.isError).toBe(true);
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload.error).toBe("HTTP 502: Bad Gateway");
        expect(payload.details).toEqual({ code: "X" });
    });

    it("returns isError for plain Error rejections", async () => {
        const httpClient = async (): Promise<never> => {
            throw new Error("network down");
        };
        const result = await executeToolCall({
            endpoint: objectEndpoint,
            args: { id: "42" },
            httpClient,
        });
        expect(result.isError).toBe(true);
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload).toEqual({ error: "network down" });
    });

    it("routes ToolCallError (missing path param) through buildToolErrorResult", async () => {
        const httpClient = vi.fn();
        const result = await executeToolCall({
            endpoint: objectEndpoint,
            args: {},
            httpClient,
        });
        expect(result.isError).toBe(true);
        expect(httpClient).not.toHaveBeenCalled();
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload.error).toMatch(/Missing path parameter: id/);
    });

    it("invokes validator when one is supplied", async () => {
        const validateResponse = vi.fn(() => ({ valid: true }));
        const validator = { validateResponse } as unknown as Parameters<
            typeof executeToolCall
        >[0]["validator"];
        const httpClient = async () => ({ status: 200, data: { id: "42", name: "Alice" } });
        await executeToolCall({
            endpoint: objectEndpoint,
            args: { id: "42" },
            httpClient,
            validator,
            outputSchema: { type: "object", properties: { id: { type: "string" } } },
        });
        expect(validateResponse).toHaveBeenCalledTimes(1);
    });

    it("skips filtering and translations when those options are omitted", async () => {
        const httpClient = async () => ({ status: 200, data: { id: "42", junk: "still here" } });
        const result = await executeToolCall({
            endpoint: objectEndpoint,
            args: { id: "42" },
            httpClient,
        });
        expect(result.structuredContent).toEqual({ id: "42", junk: "still here" });
    });
});