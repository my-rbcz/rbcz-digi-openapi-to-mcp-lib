import { describe, it, expect } from "vitest";
import { forwardAuthHeaders } from "../../src/tool/forwardAuthHeaders.js";

describe("forwardAuthHeaders", () => {
    it("reads case-insensitively and writes lower-case keys", () => {
        const out = forwardAuthHeaders({
            Authorization: "Bearer abc",
            "X-Authorization": "xyz",
        });
        expect(out).toEqual({ authorization: "Bearer abc", "x-authorization": "xyz" });
    });

    it("picks the first value when a header arrives as an array", () => {
        const out = forwardAuthHeaders({ authorization: ["a", "b"] });
        expect(out).toEqual({ authorization: "a" });
    });

    it("ignores headers we do not forward", () => {
        const out = forwardAuthHeaders({
            "x-trace-id": "abc",
            cookie: "session=1",
            authorization: "ok",
        });
        expect(out).toEqual({ authorization: "ok" });
    });

    it("returns an empty object when no auth headers are present", () => {
        expect(forwardAuthHeaders({})).toEqual({});
        expect(forwardAuthHeaders({ "x-other": "yes" })).toEqual({});
    });

    it("skips empty-string values", () => {
        expect(forwardAuthHeaders({ authorization: "" })).toEqual({});
    });

    it("skips undefined values", () => {
        expect(forwardAuthHeaders({ authorization: undefined, "x-authorization": "ok" })).toEqual({
            "x-authorization": "ok",
        });
    });
});