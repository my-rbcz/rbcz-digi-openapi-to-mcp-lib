import { describe, it, expect } from "vitest";
import { generateToolName } from "../../src/tool/generateToolName.js";
import type { Endpoint, HttpMethod } from "../../src/types.js";

function endpoint(method: HttpMethod, path: string): Endpoint {
    return { method, path, parameters: [], responses: {} };
}

describe("generateToolName", () => {
    it.each([
        ["GET", "/clients", "getClients"],
        ["POST", "/clients", "postClients"],
        ["POST", "/debitcards/transactions", "postDebitcardsTransactions"],
        ["GET", "/accounts/{accountId}", "getAccountsAccountId"],
        ["DELETE", "/contacts/{contactId}", "deleteContactsContactId"],
        ["PATCH", "/a/b/c/d", "patchABCD"],
        ["GET", "/users//trailing/", "getUsersTrailing"],
        ["GET", "/", "get"],
        ["HEAD", "/ping", "headPing"],
        ["OPTIONS", "/preflight", "optionsPreflight"],
    ] as [HttpMethod, string, string][])("%s %s → %s", (method, path, expected) => {
        expect(generateToolName(endpoint(method, path))).toBe(expected);
    });
});
