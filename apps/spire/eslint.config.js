import vitest from "@vitest/eslint-plugin";
import { base } from "@vex-chat/eslint-config/base";
import n from "eslint-plugin-n";
import tseslint from "typescript-eslint";

export default tseslint.config(
    ...base,
    n.configs["flat/recommended"],
    {
        languageOptions: {
            parserOptions: {
                // spire uses a custom tsconfig.eslint.json that includes scripts/.
                // Disable projectService (which base sets to true) so the
                // explicit `project` setting takes effect.
                projectService: false,
                project: "./tsconfig.eslint.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // server-side strictness: ban any, require explicit error handling.
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-type-assertion": "error",
            "@typescript-eslint/no-import-type-side-effects": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/prefer-promise-reject-errors": "error",
            "@typescript-eslint/no-unnecessary-type-assertion": "error",

            // override base's perfectionist sort to add a `framework` group
            // for express-related imports.
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
                        {
                            groupName: "framework",
                            elementNamePattern: "^express",
                        },
                    ],
                    groups: [
                        "type-imports",
                        "builtin",
                        "framework",
                        "internal",
                        "external",
                        "parent",
                        "sibling",
                        "index",
                        "unknown",
                    ],
                },
            ],

            "n/no-missing-import": "off",
            "n/no-unpublished-import": "off",
            "n/no-process-exit": "off",
        },
    },
    {
        files: ["src/__tests__/**/*.ts"],
        plugins: { vitest },
        rules: {
            ...vitest.configs.recommended.rules,
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-type-assertion": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/prefer-promise-reject-errors": "off",
            "@typescript-eslint/no-unused-vars": "warn",
            // Tests don't need the Vex copyright header.
            "headers/header-format": "off",
        },
    },
);
