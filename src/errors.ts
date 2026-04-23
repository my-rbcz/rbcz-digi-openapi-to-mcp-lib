export type ParseStage = "parse" | "dereference" | "extract";

export class OpenApiParseError extends Error {
    override readonly cause?: unknown;
    readonly stage: ParseStage;

    constructor(message: string, stage: ParseStage, cause?: unknown) {
        super(message);
        this.name = "OpenApiParseError";
        this.stage = stage;
        this.cause = cause;
    }
}

export class SchemaFilterError extends Error {
    override readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = "SchemaFilterError";
        this.cause = cause;
    }
}

export function describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export function noopLogger() {
    return {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    };
}