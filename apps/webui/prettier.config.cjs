// @ts-check

/** @type {import("prettier").Config} */
/** @type {import("@ianvs/prettier-plugin-sort-imports").PrettierConfig} */

module.exports = {
    plugins: [require.resolve("prettier-plugin-tailwindcss")],
    tabWidth: 4,
    useTabs: false,
    printWidth: 120,
    trailingComma: "all",
    singleQuote: false,
    semi: true,
    importOrder: [
        "^react$",
        "^next/(.*)$",
        "",
        "<THIRD_PARTY_MODULES>",
        "",
        "^@app/(.*)$",
        "^@components/(.*)$",
        "^@styles/(.*)$",
        "^@utils/(.*)$",
        "^@env/(.*)$",
        "^[./]",
    ],
    importOrderBuiltinModulesToTop: true,
    importOrderCaseInsensitive: true,
    importOrderParserPlugins: ["typescript", "jsx", "decorators-legacy"],
    importOrderMergeDuplicateImports: true,
    importOrderCombineTypeAndValueImports: true,
    importOrderSeparation: false,
    importOrderSortSpecifiers: true,
};
