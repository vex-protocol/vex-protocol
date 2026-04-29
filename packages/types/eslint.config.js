import perfectionist from "eslint-plugin-perfectionist";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
    ...tseslint.configs.strictTypeChecked,
    perfectionist.configs["recommended-natural"],
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
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
            "@typescript-eslint/consistent-type-imports": [
                "error",
                {
                    prefer: "type-imports",
                    fixStyle: "separate-type-imports",
                },
            ],
            "@typescript-eslint/consistent-type-exports": "error",
            "@typescript-eslint/explicit-function-return-type": "error",
            "@typescript-eslint/explicit-module-boundary-types": "error",
            "@typescript-eslint/no-import-type-side-effects": "error",
            "@typescript-eslint/prefer-readonly": "error",
            "@typescript-eslint/require-array-sort-compare": "error",

            "perfectionist/sort-imports": [
                "error",
                {
                    type: "natural",
                    order: "asc",
                    ignoreCase: true,
                    internalPattern: ["^@vex-chat/"],
                    newlinesBetween: 1,
                    customGroups: [
                        {
                            groupName: "type-imports",
                            modifiers: ["type"],
                        },
                    ],
                    groups: [
                        "type-imports",
                        "builtin",
                        "internal",
                        "external",
                        "parent",
                        "sibling",
                        "index",
                        "unknown",
                    ],
                },
            ],
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
    eslintConfigPrettier,
);
