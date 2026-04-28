import { describe, it, expect } from "vitest";
import { buildToolErrorResult } from "../../src/tool/buildToolErrorResult.js";

describe("buildToolErrorResult", () => {
    it("formats axios-shaped errors with status, statusText and details", () => {
        const error = {
            response: {
                status: 502,
                statusText: "Bad Gateway",
                data: { code: "UPSTREAM" },
            },
        };
        const result = buildToolErrorResult(error);
        expect(result.isError).toBe(true);
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload).toEqual({
            error: "HTTP 502: Bad Gateway",
            details: { code: "UPSTREAM" },
        });
    });

    it("omits the colon-suffix when statusText is missing", () => {
        const result = buildToolErrorResult({ response: { status: 500 } });
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload.error).toBe("HTTP 500");
        expect(payload.details).toBeUndefined();
    });

    it("falls through to message-shape when status is not numeric", () => {
        const error = new Error("boom");
        (error as unknown as { response: unknown }).response = { status: "oops" };
        const result = buildToolErrorResult(error);
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload).toEqual({ error: "boom" });
        expect(result.isError).toBe(true);
    });

    it("uses error.message for plain Error instances", () => {
        const result = buildToolErrorResult(new Error("kaboom"));
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload).toEqual({ error: "kaboom" });
    });

    it("returns 'Unknown error' for non-Error throwables", () => {
        const result = buildToolErrorResult("a string");
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload).toEqual({ error: "Unknown error" });
    });

    it("returns 'Unknown error' for null", () => {
        const result = buildToolErrorResult(null);
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload).toEqual({ error: "Unknown error" });
    });

    it("falls through to message-shape when response.status is not a number on a non-Error throwable", () => {
        const result = buildToolErrorResult({ response: { status: "x" } });
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload).toEqual({ error: "Unknown error" });
    });

    it("falls through when response is null", () => {
        const result = buildToolErrorResult({ response: null });
        const payload = JSON.parse(result.content[0]!.text);
        expect(payload).toEqual({ error: "Unknown error" });
    });
});