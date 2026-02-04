const tseslint = require("typescript-eslint");

const customConfig = require("eslint-config-custom");

const serverFiles = ["apps/server/**/*.ts"];
const typeCheckedConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: serverFiles,
}));

module.exports = [
    ...customConfig,
    {
        ignores: ["**/.next/**", "**/dist/**", "**/.turbo/**", "**/node_modules/**"],
    },
    {
        settings: {
            react: {
                version: "19.2.3",
            },
        },
    },
    ...typeCheckedConfigs,
    {
        files: serverFiles,
        languageOptions: {
            parserOptions: {
                project: ["apps/server/tsconfig.json"],
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            "@typescript-eslint/require-await": "off",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": "error",
        },
    },
];
