const path = require("node:path");

const root = __dirname;

module.exports = {
    apps: [
        {
            name: "opencloud-server",
            cwd: path.join(root, "apps/server"),
            script: "./dist/index.mjs",
            env: {
                NODE_ENV: "production",
            },
        },
        {
            name: "opencloud-nova",
            cwd: path.join(root, "apps/nova"),
            script: "./.output/server/index.mjs",
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
