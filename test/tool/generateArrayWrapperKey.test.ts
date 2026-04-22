import { describe, it, expect } from "vitest";
import { generateArrayWrapperKey } from "../../src/tool/generateArrayWrapperKey.js";

describe("generateArrayWrapperKey", () => {
    it.each([
        ["getClients", "clients"],
        ["postDebitcardsTransactions", "debitcardsTransactions"],
        ["putAccounts", "accounts"],
        ["deleteItems", "items"],
        ["patchFoo", "foo"],
        ["get", "items"],
        ["unprefixed", "unprefixed"],
    ])("%s → %s", (tool, expected) => {
        expect(generateArrayWrapperKey(tool)).toBe(expected);
    });
});
