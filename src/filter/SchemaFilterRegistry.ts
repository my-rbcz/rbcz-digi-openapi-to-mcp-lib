import type { Protocol, SchemaFilterDefinition } from "../types.js";

/**
 * In-memory registry of schema filters keyed by `${backend}:${protocol}:${operation}`.
 *
 * Deliberately stateless beyond its Map — no TTL, no I/O, no refresh. Callers
 * that need caching or expiry wrap this with their own logic.
 */
export class SchemaFilterRegistry {
    private readonly filters: Map<string, SchemaFilterDefinition> = new Map();

    add(filter: SchemaFilterDefinition): void {
        this.filters.set(key(filter.backend, filter.protocol, filter.operation), filter);
    }

    has(backend: string, protocol: Protocol, operation: string): boolean {
        return this.filters.has(key(backend, protocol, operation));
    }

    get(backend: string, protocol: Protocol, operation: string): SchemaFilterDefinition | undefined {
        return this.filters.get(key(backend, protocol, operation));
    }

    all(): SchemaFilterDefinition[] {
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