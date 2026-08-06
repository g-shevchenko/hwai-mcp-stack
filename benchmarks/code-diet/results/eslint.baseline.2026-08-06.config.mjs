import tseslint from "typescript-eslint";
export default [{ files: ["**/*.{js,mjs,ts}"], languageOptions: { parser: tseslint.parser }, plugins: { "@typescript-eslint": tseslint.plugin }, rules: { "no-unused-vars": "off", "@typescript-eslint/no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" }], "no-unreachable": "error" } }];
