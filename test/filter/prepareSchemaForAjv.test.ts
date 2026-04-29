import { describe, it, expect } from "vitest";
import { prepareSchemaForAjv } from "../../src/filter/prepareSchemaForAjv.js";

describe("prepareSchemaForAjv", () => {
    it("does not mutate the input", () => {
        const input = { type: "object", properties: { id: { type: "string" } } };
        const snapshot = JSON.parse(JSON.stringify(input));
        prepareSchemaForAjv(input);
        expect(input).toEqual(snapshot);
    });

    it("locks plain object nodes with properties", () => {
        const out = prepareSchemaForAjv({
            type: "object",
            properties: { id: { type: "string" } },
        }) as Record<string, unknown>;
        expect(out.additionalProperties).toBe(false);
    });

    it("does NOT touch dynamic-map nodes (additionalProperties: <schema>)", () => {
        const out = prepareSchemaForAjv({
            type: "object",
            additionalProperties: { type: "object", properties: { x: { type: "string" } } },
        }) as Record<string, unknown>;
        // Outer node keeps its schema-valued additionalProperties — not
        // overwritten with `false`.
        expect(out.additionalProperties).toEqual(
            expect.objectContaining({ type: "object", additionalProperties: false }),
        );
    });

    it("recurses into properties and items", () => {
        const out = prepareSchemaForAjv({
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: { type: "object", properties: { id: { type: "string" } } },
                },
            },
        }) as any;
        expect(out.additionalProperties).toBe(false);
        expect(out.properties.items.items.additionalProperties).toBe(false);
    });

    it("does NOT recurse into oneOf / anyOf branches", () => {
        const out = prepareSchemaForAjv({
            oneOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { type: "object", properties: { b: { type: "number" } } },
            ],
        }) as any;
        // Branches are kept as-is — no `additionalProperties: false` injected.
        expect(out.oneOf[0]).not.toHaveProperty("additionalProperties");
        expect(out.oneOf[1]).not.toHaveProperty("additionalProperties");
    });

    it("hoists allOf branch properties into the parent before locking", () => {
        const out = prepareSchemaForAjv({
            type: "object",
            allOf: [
                { type: "object", properties: { title: { type: "string" }, firstName: { type: "string" } } },
                { type: "object", properties: { loginName: { type: "string" } } },
            ],
        }) as any;

        // Parent gets locked AND the merged properties are present so
        // AJV's removeAdditional has something to keep.
        expect(out.additionalProperties).toBe(false);
        expect(Object.keys(out.properties).sort()).toEqual(["firstName", "loginName", "title"]);

        // allOf branches themselves are left unlocked — locking them would
        // make AJV strip valid keys out of the matching data.
        expect(out.allOf[0]).not.toHaveProperty("additionalProperties");
        expect(out.allOf[1]).not.toHaveProperty("additionalProperties");
    });

    it("allOf hoist: parent's own properties win on conflict", () => {
        const parentSchema = { type: "string", description: "parent wins" };
        const out = prepareSchemaForAjv({
            type: "object",
            properties: { id: parentSchema },
            allOf: [{ type: "object", properties: { id: { type: "number" } } }],
        }) as any;
        expect(out.properties.id.type).toBe("string");
    });

    it("allOf hoist: recurses through nested allOf", () => {
        const out = prepareSchemaForAjv({
            type: "object",
            allOf: [
                {
                    allOf: [
                        { type: "object", properties: { deep: { type: "string" } } },
                    ],
                },
            ],
        }) as any;
        expect(out.properties.deep).toEqual({ type: "string" });
    });

    it("lowers nullable: true on nested fields", () => {
        const out = prepareSchemaForAjv({
            type: "object",
            properties: {
                middleName: { type: "string", nullable: true },
            },
        }) as any;
        expect(out.properties.middleName.type).toEqual(["string", "null"]);
        expect(out.properties.middleName).not.toHaveProperty("nullable");
    });

    it("respects an explicit additionalProperties: true", () => {
        const out = prepareSchemaForAjv({
            type: "object",
            properties: { id: { type: "string" } },
            additionalProperties: true,
        }) as any;
        expect(out.additionalProperties).toBe(true);
    });
});
