import { defineConfig } from "vitest/config";

const asyncTestFiles = [
    "src/__tests__/xAsyncProfile.ts",
    "src/__tests__/xAsyncApi.extended.test.ts",
];

/**
 * Two projects so CI can run core and async API tests as separate
 * steps with no duplicate work. `vitest run` (default `npm test`) still executes both.
 */
export default defineConfig({
    test: {
        globals: true,
        projects: [
            {
                extends: true,
                test: {
                    exclude: asyncTestFiles,
                    include: ["src/__tests__/**/*.ts"],
                    name: "core",
                },
            },
            {
                extends: true,
                test: {
                    include: asyncTestFiles,
                    name: "async-api",
                },
            },
        ],
    },
});
