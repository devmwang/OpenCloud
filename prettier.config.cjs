// @ts-check

/** @type {import("prettier").Config} */
/** @type {import("@ianvs/prettier-plugin-sort-imports").PrettierConfig} */

module.exports = {
    plugins: [
        require.resolve("@ianvs/prettier-plugin-sort-imports"),
        require.resolve("prettier-plugin-tailwindcss"),
    ],
    tabWidth: 4,
    useTabs: false,
    printWidth: 120,
    trailingComma: "all",
    singleQuote: false,
    semi: true,
    importOrder: ["<BUILTIN_MODULES>", "", "<THIRD_PARTY_MODULES>", "", "^@/(.*)$", "", "^[./]"],
    importOrderParserPlugins: ["typescript", "jsx", "decorators-legacy"],
    importOrderTypeScriptVersion: "5.9.3",
    importOrderCaseSensitive: false,
};
