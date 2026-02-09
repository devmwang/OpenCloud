import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ["dist/**", ".output/**", ".vinxi/**", ".tanstack/**", "node_modules/**", "src/routeTree.gen.ts"],
    },
    {
        files: ["**/*.{ts,tsx}"],
        rules: {
            "@typescript-eslint/consistent-type-imports": "error",
        },
    },
);
