const turboConfig = require("eslint-config-turbo/flat").default ?? require("eslint-config-turbo/flat");
const prettierConfig = require("eslint-config-prettier/flat");

module.exports = [...turboConfig, prettierConfig];
