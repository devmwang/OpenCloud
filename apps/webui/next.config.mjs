// @ts-check

/**
 * Validate env variables
 */
import { env } from "./src/env/env.mjs";

/** @type {import("next").NextConfig} */

const config = {
    experimental: {
        typedRoutes: true,
    },
    reactStrictMode: true,
    swcMinify: true,
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL,
                port: "",
                pathname: "/*/files/get/**",
            },
        ],
    },
};
export default config;
