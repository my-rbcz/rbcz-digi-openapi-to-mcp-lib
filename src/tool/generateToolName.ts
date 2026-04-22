import type { Endpoint } from "../types.js";

/**
 * Build a deterministic MCP tool name from an endpoint's method and path.
 *
 * Format: `${lowercase method}${PascalCasedPathSegments}`. The `operationId`
 * is intentionally ignored so that tool names stay stable across spec edits.
 *
 *   GET  /clients                  → getClients
 *   POST /debitcards/transactions  → postDebitcardsTransactions
 *   GET  /accounts/{accountId}     → getAccountsAccountId
 */
export function generateToolName(endpoint: Endpoint): string {
    const segments = endpoint.path.split("/").filter(Boolean);
    const pascal = segments.map(stripBraces).map(capitalize).join("");
    return `${endpoint.method.toLowerCase()}${pascal}`;
}

function stripBraces(segment: string): string {
    return segment.replace(/[{}]/g, "");
}

function capitalize(segment: string): string {
    if (segment.length === 0) return segment;
    return segment.charAt(0).toUpperCase() + segment.slice(1);
}