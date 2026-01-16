// @ts-check

/**
 * Validate env variables
 */
import { env } from "./src/env/env.mjs";

/** @type {import("next").NextConfig} */

const serverUrl = new URL(env.NEXT_PUBLIC_OPENCLOUD_SERVER_URL);

const config = {
    typedRoutes: true,
    reactStrictMode: true,
    images: {
        remotePatterns: [
            {
                protocol: serverUrl.protocol.replace(":", ""),
                hostname: serverUrl.hostname,
                port: serverUrl.port,
                pathname: "/*/files/get/**",
            },
        ],
    },
};
export default config;
