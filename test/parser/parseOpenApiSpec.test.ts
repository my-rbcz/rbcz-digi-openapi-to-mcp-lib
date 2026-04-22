import { describe, it, expect } from "vitest";
import { parseOpenApiSpec } from "../../src/parser/parseOpenApiSpec.js";
import { OpenApiParseError } from "../../src/errors.js";
import { loadFixture } from "../fixtures/loadFixture.js";

describe("parseOpenApiSpec", () => {
    it("parses a minimal YAML spec", async () => {
        const parsed = await parseOpenApiSpec(loadFixture("minimal.yml"));
        expect(parsed.title).toBe("Minimal");
        expect(parsed.version).toBe("1.0.0");
        expect(parsed.endpoints).toHaveLength(1);
        expect(parsed.endpoints[0]?.method).toBe("GET");
        expect(parsed.endpoints[0]?.path).toBe("/ping");
        expect(parsed.endpoints[0]?.baseUrl).toBe("https://api.example.com");
    });

    it("parses a JSON spec and dereferences $ref", async () => {
        const parsed = await parseOpenApiSpec(loadFixture("with-refs.json"));
        const schema = parsed.endpoints[0]?.responses["200"]?.content?.["application/json"]?.schema as any;
        expect(schema.type).toBe("object");
        expect(schema.properties.address.type).toBe("object");
        expect(schema.properties.address.properties.city.type).toBe("string");
    });

    it("accepts a pre-parsed object", async () => {
        const obj = {
            openapi: "3.0.0",
            info: { title: "Obj", version: "1" },
            paths: {
                "/x": {
                    get: {
                        responses: { "200": { description: "OK" } },
                    },
                },
            },
        };
        const parsed = await parseOpenApiSpec(obj);
        expect(parsed.endpoints).toHaveLength(1);
    });

    it("normalizes Windows and old-Mac line endings", async () => {
        const raw = loadFixture("minimal.yml");
        const withCrLf = raw.replace(/\n/g, "\r\n");
        const withCr = raw.replace(/\n/g, "\r");
        await expect(parseOpenApiSpec(withCrLf)).resolves.toBeDefined();
        await expect(parseOpenApiSpec(withCr)).resolves.toBeDefined();
    });

    it("extracts all HTTP methods when present", async () => {
        const parsed = await parseOpenApiSpec(loadFixture("all-methods.yml"));
        const methods = parsed.endpoints.map((e) => e.method).sort();
        expect(methods).toEqual(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);
    });

    it("throws OpenApiParseError with stage=parse on unparseable input", async () => {
        // YAML is very permissive — craft input with a true syntax error (unclosed flow mapping).
        await expect(parseOpenApiSpec("{ unterminated: [oops")).rejects.toMatchObject({
            name: "OpenApiParseError",
            stage: "parse",
        });
    });

    it("throws OpenApiParseError with stage=dereference when $ref targets are missing", async () => {
        const broken = {
            openapi: "3.0.0",
            info: { title: "Broken", version: "1" },
            paths: {
                "/x": {
                    get: {
                        responses: {
                            "200": {
                                description: "OK",
                                content: {
                                    "application/json": { schema: { $ref: "#/components/schemas/DoesNotExist" } },
                                },
                            },
                        },
                    },
                },
            },
        };
        try {
            await parseOpenApiSpec(broken);
            throw new Error("expected throw");
        } catch (error) {
            expect(error).toBeInstanceOf(OpenApiParseError);
            expect((error as OpenApiParseError).stage).toBe("dereference");
        }
    });

    it("rejects non-string non-object inputs", async () => {
        // @ts-expect-error testing runtime guard
        await expect(parseOpenApiSpec(42)).rejects.toBeInstanceOf(OpenApiParseError);
    });
});
