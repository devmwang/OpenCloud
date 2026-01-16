const nextConfig = require("eslint-config-next");
const turboConfig = require("eslint-config-turbo/flat").default ?? require("eslint-config-turbo/flat");
const prettierConfig = require("eslint-config-prettier/flat");

module.exports = [
    ...nextConfig,
    ...turboConfig,
    prettierConfig,
    {
        rules: {
            "@next/next/no-html-link-for-pages": "off",
            "react-hooks/set-state-in-effect": "off",
        },
    },
];
