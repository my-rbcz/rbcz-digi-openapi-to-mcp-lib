import type { ValidationError } from "../types.js";

export function summarizeErrors(errors: ValidationError[]): string {
    const fieldCount = new Set(errors.map((e) => e.field)).size;
    const keywordSummary = groupByKeyword(errors);
    return `${errors.length} validation error(s) in ${fieldCount} field(s): ${keywordSummary}`;
}

function groupByKeyword(errors: ValidationError[]): string {
    const counts: Record<string, number> = {};
    for (const error of errors) {
        const keyword = error.keyword ?? "unknown";
        counts[keyword] = (counts[keyword] ?? 0) + 1;
    }
    return Object.entries(counts)
        .map(([keyword, count]) => `${count} ${keyword}`)
        .join(", ");
}