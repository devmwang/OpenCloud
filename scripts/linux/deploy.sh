#!/usr/bin/env bash

set -euo pipefail

fail() {
    echo "deploy.sh: $*" >&2
    exit 1
}

[[ $# -eq 0 ]] || fail "This command does not accept arguments."
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
pnpm run build

for process_name in opencloud-server opencloud-nova; do
    if pm2 describe "$process_name" >/dev/null 2>&1; then
        pm2 delete "$process_name"
    fi
done
pm2 save --force

pnpm exec dotenvx run --convention=nextjs -- pnpm --filter server db:migrate
pnpm exec dotenvx run --convention=nextjs -- pm2 start ecosystem.config.js --update-env
pm2 save
pm2 status
