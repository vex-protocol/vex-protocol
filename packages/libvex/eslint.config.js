import vitest from "@vitest/eslint-plugin";
import { base } from "@vex-chat/eslint-config/base";
import tseslint from "typescript-eslint";

export default tseslint.config(
    ...base,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["vitest.config.ts"],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-unsafe-type-assertion": "error",
            "@typescript-eslint/no-import-type-side-effects": "error",
            "@typescript-eslint/prefer-readonly": "error",
            "@typescript-eslint/require-array-sort-compare": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            "no-console": "error",
        },
    },
    {
        files: ["src/__tests__/**/*.ts"],
        plugins: { vitest },
        rules: {
            ...vitest.configs.recommended.rules,
            "@typescript-eslint/no-unsafe-type-assertion": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            // Tests don't need the Vex copyright header.
            "headers/header-format": "off",
        },
    },
    {
        files: ["src/Client.ts"],
        rules: {
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            // Client pulls many wire types from workspace packages; when local
            // resolution fails, TS emits `error` types and stricter rules spam
            // the whole file — same rationale as the no-unsafe-* carve-out.
            "@typescript-eslint/no-redundant-type-constituents": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/restrict-plus-operands": "off",
        },
    },
    {
        files: ["vitest.config.ts"],
        rules: {
            // Vitest config imports local plugin via runtime ESM path; parser
            // may surface it as `any` in config-only context.
            "@typescript-eslint/no-unsafe-assignment": "off",
        },
    },
);
