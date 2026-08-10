#!/usr/bin/env bash

set -euo pipefail

fail() {
    echo "deploy.sh: $*" >&2
    exit 1
}

remove_opencloud_processes() {
    local process_name

    for process_name in opencloud-server opencloud-nova; do
        if pm2 describe "$process_name" >/dev/null 2>&1; then
            pm2 delete "$process_name"
        fi
    done
}

[[ $# -eq 1 ]] || fail "Usage: ./scripts/linux/deploy.sh <server|nova|both>"

deploy_mode="$1"
case "$deploy_mode" in
    server)
        pm2_processes="opencloud-server"
        ;;
    nova)
        pm2_processes="opencloud-nova"
        ;;
    both)
        pm2_processes="opencloud-server,opencloud-nova"
        ;;
    *)
        fail "Mode must be server, nova, or both."
        ;;
esac

[[ "${EUID:-$(id -u)}" -ne 0 ]] || fail "Run this command as the normal PM2 user, not as root."
[[ -r /etc/os-release ]] || fail "Cannot read /etc/os-release."

# shellcheck source=/etc/os-release
source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] ||
    fail "Ubuntu Server 24.04 LTS is required."

for required_command in node pnpm pm2; do
    command -v "$required_command" >/dev/null || fail "$required_command is required."
done

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)' ||
    fail "Node.js 22.12.0 or later is required."

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"

[[ -f .env || -f .env.local ]] || fail "Create and configure .env or .env.local first."

pnpm install --frozen-lockfile
if [[ "$deploy_mode" == "both" ]]; then
    pnpm run build
else
    pnpm run build --filter="$deploy_mode"
fi

remove_opencloud_processes
pm2 save --force

if [[ "$deploy_mode" != "nova" ]]; then
    pnpm exec dotenvx run --convention=nextjs -- pnpm --filter server db:migrate
fi

if ! pnpm exec dotenvx run --convention=nextjs -- pm2 start ecosystem.config.js --only "$pm2_processes" --update-env; then
    remove_opencloud_processes
    pm2 save --force
    fail "PM2 could not start the selected OpenCloud processes."
fi

sleep 5
if ! PM2_SILENT=true pm2 jlist | node -e '
const expected = new Set(process.argv[1].split(","));
const opencloud = JSON.parse(require("node:fs").readFileSync(0, "utf8")).filter(
    ({ name }) => name === "opencloud-server" || name === "opencloud-nova",
);
process.exit(
    opencloud.length === expected.size &&
        [...expected].every((name) =>
            opencloud.some(
                (process) =>
                    process.name === name &&
                    process.pm2_env.status === "online" &&
                    process.pm2_env.restart_time === 0,
            ),
        )
        ? 0
        : 1,
);
' "$pm2_processes"; then
    remove_opencloud_processes
    pm2 save --force
    fail "The selected OpenCloud processes did not stay online."
fi

pm2 save
pm2 status
