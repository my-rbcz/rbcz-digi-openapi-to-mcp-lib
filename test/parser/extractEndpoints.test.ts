import { describe, it, expect } from "vitest";
import { parseOpenApiSpec } from "../../src/parser/parseOpenApiSpec.js";
import { loadFixture } from "../fixtures/loadFixture.js";

describe("extractEndpoints (via parseOpenApiSpec)", () => {
    it("uppercases the method", async () => {
        const parsed = await parseOpenApiSpec(loadFixture("minimal.yml"));
        expect(parsed.endpoints[0]?.method).toBe("GET");
    });

    it("extracts path parameters with required flag", async () => {
        const parsed = await parseOpenApiSpec(loadFixture("params-and-body.yml"));
        const ep = parsed.endpoints.find((e) => e.path === "/accounts/{accountId}/transactions");
        expect(ep).toBeDefined();
        const pathParam = ep!.parameters.find((p) => p.in === "path");
        expect(pathParam?.name).toBe("accountId");
        expect(pathParam?.required).toBe(true);
    });

    it("extracts the request body for POST endpoints", async () => {
        const parsed = await parseOpenApiSpec(loadFixture("params-and-body.yml"));
        const ep = parsed.endpoints.find((e) => e.path === "/accounts/{accountId}/transactions");
        expect(ep?.requestBody?.required).toBe(true);
        expect(ep?.requestBody?.content["application/json"]?.schema).toBeDefined();
    });
});
