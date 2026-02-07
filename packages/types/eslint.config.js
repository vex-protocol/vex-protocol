const ts = require("@typescript-eslint/eslint-plugin");
const parser = require("@typescript-eslint/parser");

module.exports = [
    {
        files: ["**/*.ts"],
        languageOptions: { parser },
        plugins: { "@typescript-eslint": ts },
        rules: {
            "@typescript-eslint/interface-name-prefix": "off", 
            "@typescript-eslint/no-explicit-any": "off"
        }
    }
];