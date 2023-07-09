// @ts-check

/**
 * Validate env variables
 */
import "./src/env/env.mjs";

/** @type {import("next").NextConfig} */

const config = {
    reactStrictMode: true,
    experimental: {
        typedRoutes: true,
    },
    swcMinify: true,
    // i18n: {
    //     locales: ["en"],
    //     defaultLocale: "en",
    // },
};
export default config;
