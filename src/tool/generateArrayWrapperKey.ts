const METHOD_PREFIX = /^(get|post|put|delete|patch)/i;

/**
 * Derive the object key used to wrap an array response for MCP structuredContent.
 *
 *   getClients                 → clients
 *   postDebitcardsTransactions → debitcardsTransactions
 *   get                        → items    (fallback when there is no path)
 */
export function generateArrayWrapperKey(toolName: string): string {
    const withoutMethod = toolName.replace(METHOD_PREFIX, "");
    if (withoutMethod.length === 0) return "items";
    return withoutMethod.charAt(0).toLowerCase() + withoutMethod.slice(1);
}