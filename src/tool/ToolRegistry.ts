import type { Endpoint } from "../types.js";
import { generateToolName } from "./generateToolName.js";

/**
 * In-memory registry of `Endpoint`s keyed by tool name (the value
 * `generateToolName(endpoint)` returns). Mirrors `SchemaFilterRegistry` so
 * callers populating both registries from one loop see them stay in sync.
 *
 * Stateless beyond its Map — no TTL, no I/O, no refresh.
 */
export class ToolRegistry {
    private readonly endpoints: Map<string, Endpoint> = new Map();

    add(endpoint: Endpoint): string {
        const name = generateToolName(endpoint);
        this.endpoints.set(name, endpoint);
        return name;
    }

    has(toolName: string): boolean {
        return this.endpoints.has(toolName);
    }

    get(toolName: string): Endpoint | undefined {
        return this.endpoints.get(toolName);
    }

    all(): Endpoint[] {
        return Array.from(this.endpoints.values());
    }

    size(): number {
        return this.endpoints.size;
    }

    clear(): void {
        this.endpoints.clear();
    }
}