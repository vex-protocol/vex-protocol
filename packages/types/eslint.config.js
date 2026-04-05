import ts from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
    {
        files: ["**/*.ts"],
        languageOptions: { parser },
        plugins: { "@typescript-eslint": ts },
        rules: {
            "@typescript-eslint/interface-name-prefix": "off",
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
];
