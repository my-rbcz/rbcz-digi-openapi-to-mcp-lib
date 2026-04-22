import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3 } from "openapi-types";
import { OpenApiParseError } from "../errors.js";

/**
 * Dereference all $ref pointers in an OpenAPI document. This is intentionally
 * dereference() — not validate() — so consumers get an inlined tree ready for
 * schema filtering without any lingering $ref nodes.
 */
export async function dereferenceSpec(parsed: unknown): Promise<OpenAPIV3.Document> {
    try {
        // SwaggerParser mutates the argument; clone to protect the caller.
        // The overload signatures on dereference() don't line up perfectly with
        // a plain object input, so we cast to the expected Document type.
        const cloned = structuredClone(parsed) as OpenAPIV3.Document;
        const api = (await SwaggerParser.dereference(cloned)) as OpenAPIV3.Document;
        return api;
    } catch (error) {
        throw new OpenApiParseError(`Failed to dereference OpenAPI spec: ${describe(error)}`, "dereference", error);
    }
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}