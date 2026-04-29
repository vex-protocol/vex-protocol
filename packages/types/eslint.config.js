import { base } from "@vex-chat/eslint-config/base";
import tseslint from "typescript-eslint";

export default tseslint.config(
    ...base,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // types is the type-foundation package — strictest defaults.
            "@typescript-eslint/no-unsafe-type-assertion": "error",
            "@typescript-eslint/strict-boolean-expressions": [
                "error",
                {
                    allowString: false,
                    allowNumber: false,
                    allowNullableObject: false,
                },
            ],
            "@typescript-eslint/switch-exhaustiveness-check": "error",
            "@typescript-eslint/explicit-function-return-type": "error",
            "@typescript-eslint/explicit-module-boundary-types": "error",
            "@typescript-eslint/no-import-type-side-effects": "error",
            "@typescript-eslint/prefer-readonly": "error",
            "@typescript-eslint/require-array-sort-compare": "error",
        },
    },
    {
        // Type-level assertion files — bindings exist purely for compile-time
        // checks (referenced via `typeof` in a tuple export). eslint counts
        // those as type-only uses and would flag every binding as unused.
        files: ["**/*.test-d.ts"],
        rules: {
            "@typescript-eslint/no-unused-vars": "off",
        },
    },
);
