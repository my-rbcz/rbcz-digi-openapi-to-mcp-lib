import { describe, it, expect } from "vitest";
import { parseOpenApiSpec } from "../../src/parser/parseOpenApiSpec.js";
import { buildSchemaFilter } from "../../src/filter/buildSchemaFilter.js";
import { buildAjvFilter } from "../../src/filter/buildAjvFilter.js";
import { applyFilter } from "../../src/filter/applyFilter.js";
import { applyAjvFilter } from "../../src/filter/applyAjvFilter.js";
import { loadFixture } from "../fixtures/loadFixture.js";

/**
 * Parity safety net for the parallel rollout. For each fixture endpoint,
 * build both filters from the same `Endpoint`, run both on the same
 * payload, and assert deep-equal output. Where the two paths intentionally
 * diverge, the divergence is captured in an explicit assertion so future
 * changes have to confront it.
 */

interface Case {
    fixture: string;
    method: string;
    path: string;
    payload: unknown;
    /** Filled in only when the two paths legitimately disagree. */
    divergence?: { legacy: unknown; ajv: unknown };
}

const CASES: Case[] = [
    {
        fixture: "minimal.yml",
        method: "GET",
        path: "/ping",
        payload: { ok: true, leak: "DROP" },
    },
    {
        fixture: "array-response.yml",
        method: "GET",
        path: "/clients",
        payload: [{ id: "1", name: "a", leak: 1 }, { id: "2", name: "b" }],
    },
    {
        fixture: "nested-catalogs.yml",
        method: "GET",
        path: "/accounts/{accountId}",
        payload: {
            status: "1",
            currencyFolders: {
                CZK: { status: "1", balance: 100, junk: true },
                USD: { status: "2", balance: 5 },
            },
            shouldBeStripped: "x",
        },
    },
    {
        fixture: "nullable-and-x-attrs.yml",
        method: "GET",
        path: "/cards",
        payload: {
            cardId: "c-1",
            cardType: "DEBIT",
            distributionDate: null,
            meta: { note: "n", leak: 1 },
            extra: "DROP",
        },
    },
    {
        fixture: "params-and-body.yml",
        method: "POST",
        path: "/accounts/{accountId}/transactions",
        payload: {
            transactions: [{ id: "t-1", amount: 10, leak: 1 }, { id: "t-2", amount: 20 }],
            extra: "DROP",
        },
    },
    {
        fixture: "all-methods.yml",
        method: "GET",
        path: "/things",
        payload: { count: 5, leak: "DROP" },
    },
    {
        fixture: "all-methods.yml",
        method: "POST",
        path: "/things",
        // POST /things has only a 201 response, no 200 — both filters return null.
        payload: { id: "t-1", leak: "DROP" },
    },
    {
        fixture: "with-refs.json",
        method: "GET",
        path: "/users",
        payload: { id: "u-1", address: { city: "Prague", leak: 1 }, extra: "DROP" },
    },
];

describe("parity — applyFilter vs applyAjvFilter on real fixtures", () => {
    for (const c of CASES) {
        it(`${c.fixture} ${c.method} ${c.path}`, async () => {
            const spec = await parseOpenApiSpec(loadFixture(c.fixture));
            const ep = spec.endpoints.find((e) => e.method === c.method && e.path === c.path);
            expect(ep, `endpoint ${c.method} ${c.path} not found in ${c.fixture}`).toBeDefined();

            const legacy = buildSchemaFilter({ endpoint: ep!, backend: "mch", protocol: "mcp" });
            const ajv = buildAjvFilter({ endpoint: ep!, backend: "mch", protocol: "mcp" });

            // The two builders agree on whether an endpoint is filterable.
            // Note: AJV builder doesn't reject empty-properties schemas; if a
            // future fixture exercises that, this assertion will fail and
            // we'll know to handle it explicitly.
            expect(Boolean(legacy), "legacy returned non-null").toBe(Boolean(ajv));
            if (!legacy || !ajv) return;

            // Same operation key — registries can be kept in sync.
            expect(ajv.operation).toBe(legacy.operation);

            const legacyOut = applyFilter(c.payload, legacy);
            const ajvOut = applyAjvFilter(c.payload, ajv);

            if (c.divergence) {
                expect(legacyOut).toEqual(c.divergence.legacy);
                expect(ajvOut).toEqual(c.divergence.ajv);
            } else {
                expect(ajvOut).toEqual(legacyOut);
            }
        });
    }
});
