import type { AjvFilterDefinition, Protocol } from "../types.js";

/**
 * In-memory registry of AJV-based schema filters keyed by
 * `${backend}:${protocol}:${operation}`. Parallel to `SchemaFilterRegistry`
 * — same key shape, different value type — so callers can keep both
 * registries in sync from the same set of endpoints.
 *
 * Deliberately stateless beyond its Map — no TTL, no I/O, no refresh.
 * Callers that need caching or expiry wrap this with their own logic.
 */
export class AjvFilterRegistry {
    private readonly filters: Map<string, AjvFilterDefinition> = new Map();

    add(filter: AjvFilterDefinition): void {
        this.filters.set(key(filter.backend, filter.protocol, filter.operation), filter);
    }

    has(backend: string, protocol: Protocol, operation: string): boolean {
        return this.filters.has(key(backend, protocol, operation));
    }

    get(backend: string, protocol: Protocol, operation: string): AjvFilterDefinition | undefined {
        return this.filters.get(key(backend, protocol, operation));
    }

    all(): AjvFilterDefinition[] {
        return Array.from(this.filters.values());
    }

    size(): number {
        return this.filters.size;
    }

    clear(): void {
        this.filters.clear();
    }
}

function key(backend: string, protocol: Protocol, operation: string): string {
    return `${backend}:${protocol}:${operation}`;
}
