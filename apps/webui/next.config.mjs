// @ts-check

/**
 * Validate env variables
 */
import { env } from "./src/env/env.mjs";

/** @type {import("next").NextConfig} */

const config = {
    reactStrictMode: true,
    swcMinify: true,
    // i18n: {
    //     locales: ["en"],
    //     defaultLocale: "en",
    // },
    images: {
        domains: [new URL(env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL).hostname],
    },
};
export default config;
