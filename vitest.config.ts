import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: false,
        include: ["test/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "lcov"],
            include: ["src/**/*.ts"],
            exclude: ["src/index.ts", "src/types.ts"],
            thresholds: {
                lines: 80,
                statements: 80,
                functions: 80,
                branches: 80,
            },
        },
    },
});