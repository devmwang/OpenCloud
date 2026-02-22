#!/usr/bin/env bash
# OpenCloud Linux user service setup and management.
# Usage: opencloud-user-service.sh <command> [options] [mode]
# Commands: install | update | rebuild | start | stop | restart | status | logs | uninstall
# Mode: server | nova | both (default: both where applicable)

set -euo pipefail

readonly SCRIPT_NAME="${0##*/}"
readonly OPENCLOUD_SERVICE_ENV="${OPENCLOUD_SERVICE_ENV:-$HOME/.config/opencloud/opencloud-service.env}"
readonly SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
readonly OPENCLOUD_CONFIG_DIR="${OPENCLOUD_CONFIG_DIR:-$HOME/.config/opencloud}"
readonly DEFAULT_CLONE_URL="https://github.com/devmwang/OpenCloud.git"

# Unit names (no .service suffix for systemctl)
readonly SERVER_UNIT="opencloud-server"
readonly NOVA_UNIT="opencloud-nova"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME <command> [options] [mode]

Commands:
  install     Set up OpenCloud repo, install units, and start selected mode
  update      Pull latest from git, pnpm install, build, and restart (uses repo from install)
  rebuild     pnpm install, build, and restart (no git pull; use after manual git pull)
  start       Start the service(s)
  stop        Stop the service(s)
  restart     Restart the service(s)
  status      Show status of the service(s)
  logs        Tail logs (journalctl) for the service(s)
  uninstall   Stop, disable, and remove user service setup

Mode (optional, default: both):
  server      API server only (port 8080)
  nova        Nova web UI only (port 3000)
  both        Server and Nova

Install options (only for 'install'):
  --repo=DIR       Use existing repo at DIR (must be OpenCloud root)
  --clone          Clone repository from default URL ($DEFAULT_CLONE_URL)
  --clone=URL      Clone repository from URL
  --clone-dir=DIR  Where to clone (default: \$HOME/OpenCloud)

If neither --repo nor --clone is given, install uses the current directory
if it is the OpenCloud repo root; otherwise install fails with instructions.

Examples:
  $SCRIPT_NAME install
  $SCRIPT_NAME install --repo=/path/to/OpenCloud
  $SCRIPT_NAME install --clone=https://github.com/devmwang/OpenCloud.git both
  $SCRIPT_NAME update
  $SCRIPT_NAME rebuild
  $SCRIPT_NAME start both
  $SCRIPT_NAME status
  $SCRIPT_NAME logs -f
EOF
}

err() {
    echo "$SCRIPT_NAME: $*" >&2
}

die() {
    err "$*"
    exit 1
}

# Resolve repo root: print absolute path or empty if not OpenCloud repo.
get_repo_root() {
    local dir="${1:-}"
    if [[ -z "$dir" ]]; then
        return 1
    fi
    local root
    if [[ -d "$dir/.git" ]] && [[ -f "$dir/package.json" ]]; then
        if grep -q '"name"[[:space:]]*:[[:space:]]*"opencloud"' "$dir/package.json" 2>/dev/null; then
            root="$(cd "$dir" && pwd)"
            echo "$root"
            return
        fi
    fi
    return 1
}

# Resolve repo directory used by installed user units (from opencloud-service.env).
# Prints absolute path; exits with message if not installed.
get_installed_repo_dir() {
    if [[ ! -f "$OPENCLOUD_SERVICE_ENV" ]]; then
        die "OpenCloud user service not installed (missing $OPENCLOUD_SERVICE_ENV). Run: $SCRIPT_NAME install"
    fi
    local dir
    dir="$(grep -E '^OPENCLOUD_REPO_DIR=' "$OPENCLOUD_SERVICE_ENV" 2>/dev/null | cut -d= -f2- | sed "s/^['\"]//;s/['\"]$//")"
    if [[ -z "$dir" ]] || [[ ! -d "$dir" ]]; then
        die "Invalid or missing OPENCLOUD_REPO_DIR in $OPENCLOUD_SERVICE_ENV"
    fi
    echo "$(cd "$dir" && pwd)"
}

# Return 0 if systemd user session is available.
check_systemd_user() {
    if ! command -v systemctl &>/dev/null; then
        err "systemctl not found; this script requires systemd."
        return 1
    fi
    if ! systemctl --user show-environment &>/dev/null; then
        err "systemd user session is not available."
        err "Ensure you are in a user session with logind (e.g. loginctl enable-linger \$USER)."
        return 1
    fi
    return 0
}

# Resolve pnpm binary path used by systemd units.
resolve_pnpm_bin() {
    local candidate="${PNPM_BIN:-pnpm}"
    local resolved
    resolved="$(command -v "$candidate" 2>/dev/null || true)"
    if [[ -z "$resolved" ]]; then
        die "Could not resolve pnpm binary from PNPM_BIN=${candidate}. Ensure pnpm is installed and on PATH."
    fi
    echo "$resolved"
}

# Write environment file consumed by systemd user units.
write_service_env() {
    local repo_dir="$1"
    local repo_dir_escaped="${repo_dir//\\/\\\\}"
    repo_dir_escaped="${repo_dir_escaped//\"/\\\"}"

    local pnpm_bin
    pnpm_bin="$(resolve_pnpm_bin)"
    local pnpm_bin_escaped="${pnpm_bin//\\/\\\\}"
    pnpm_bin_escaped="${pnpm_bin_escaped//\"/\\\"}"

    mkdir -p "$OPENCLOUD_CONFIG_DIR"
    printf 'OPENCLOUD_REPO_DIR="%s"\nPNPM_BIN="%s"\n' "$repo_dir_escaped" "$pnpm_bin_escaped" > "$OPENCLOUD_SERVICE_ENV"
    echo "Wrote $OPENCLOUD_SERVICE_ENV"
}

# Check Linux (optional but warn on other OS)
check_linux() {
    local os
    os="$(uname -s 2>/dev/null || true)"
    if [[ "$os" != "Linux" ]]; then
        err "This script is intended for Linux (detected: $os). Some steps may fail."
    fi
}

# Ensure required tools exist.
check_tools() {
    local required_tools=("$@")
    if [[ ${#required_tools[@]} -eq 0 ]]; then
        required_tools=(git node pnpm)
    fi

    local missing=()
    local cmd
    for cmd in "${required_tools[@]}"; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        die "Missing required tools: ${missing[*]}. Install git (if needed), Node.js (>=22.12), and pnpm (e.g. corepack enable && corepack prepare pnpm@latest --activate)."
    fi
}

# Parse mode: server | nova | both. Default both.
parse_mode() {
    local arg="${1:-both}"
    case "$arg" in
        server|nova|both) echo "$arg" ;;
        *) die "Invalid mode: $arg. Use server, nova, or both." ;;
    esac
}

# Get unit names for a mode.
units_for_mode() {
    local mode="$1"
    case "$mode" in
        server) echo "$SERVER_UNIT" ;;
        nova)   echo "$NOVA_UNIT" ;;
        both)   echo "$SERVER_UNIT $NOVA_UNIT" ;;
        *)     die "Invalid mode: $mode" ;;
    esac
}

# Run systemctl --user for given units (e.g. start, stop).
systemctl_user_units() {
    local action="$1"
    shift
    local units
    units=($(units_for_mode "${1:-both}"))
    systemctl --user "$action" "${units[@]}"
}

# Copy OpenCloud unit files from a repo and reload systemd user daemon.
sync_user_units_from_repo() {
    local repo_dir="$1"
    local deploy_units="$repo_dir/deploy/systemd/user"
    if [[ ! -d "$deploy_units" ]]; then
        die "Unit files not found at $deploy_units"
    fi
    mkdir -p "$SYSTEMD_USER_DIR"
    cp -f "$deploy_units/opencloud-server.service" "$deploy_units/opencloud-nova.service" "$SYSTEMD_USER_DIR/"
    echo "Installed unit files to $SYSTEMD_USER_DIR"
    systemctl --user daemon-reload
    echo "Reloaded systemd user daemon"
}

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

cmd_install() {
    local mode="both"
    local mode_set=0
    local repo_dir=""
    local clone_url=""
    local clone_dir="$HOME/OpenCloud"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --repo=*) repo_dir="${1#--repo=}" ;;
            --clone) clone_url="$DEFAULT_CLONE_URL" ;;
            --clone=*) clone_url="${1#--clone=}" ;;
            --clone-dir=*) clone_dir="${1#--clone-dir=}" ;;
            server|nova|both)
                if [[ "$mode_set" -eq 1 ]]; then
                    die "Mode specified more than once (extra value: $1). Use only one of: server, nova, both."
                fi
                mode="$(parse_mode "$1")"
                mode_set=1
                ;;
            *)
                die "Unknown argument for install: $1"
                ;;
        esac
        shift
    done

    check_linux
    check_systemd_user || exit 1
    local required_tools=(node pnpm)
    if [[ -n "$clone_url" ]]; then
        required_tools+=(git)
    fi
    check_tools "${required_tools[@]}"

    # Resolve repo directory
    if [[ -n "$repo_dir" ]]; then
        local requested_repo_dir="$repo_dir"
        if ! repo_dir="$(cd "$requested_repo_dir" && pwd)"; then
            die "Invalid --repo directory (does not exist or not accessible): $requested_repo_dir"
        fi
        if ! get_repo_root "$repo_dir" &>/dev/null; then
            die "Not an OpenCloud repo root: $repo_dir"
        fi
    elif [[ -n "$clone_url" ]]; then
        mkdir -p "$(dirname "$clone_dir")"
        if [[ -d "$clone_dir/.git" ]]; then
            if ! get_repo_root "$clone_dir" &>/dev/null; then
                die "Refusing to pull: $clone_dir is a git repo but not OpenCloud. Use a different --clone-dir or --repo=DIR."
            fi
            echo "Pulling existing OpenCloud clone at $clone_dir ..."
            (cd "$clone_dir" && git pull)
        else
            echo "Cloning OpenCloud into $clone_dir ..."
            git clone "$clone_url" "$clone_dir"
        fi
        repo_dir="$(get_repo_root "$clone_dir")" || die "Cloned directory is not OpenCloud root: $clone_dir"
    else
        repo_dir="$(get_repo_root .)" || die "Current directory is not the OpenCloud repo root. Run from repo root or use --repo=DIR or --clone=URL."
    fi

    echo "Using OpenCloud repo: $repo_dir"

    # Install dependencies and build selected targets
    echo "Installing dependencies (pnpm install) ..."
    (cd "$repo_dir" && pnpm install)

    echo "Building selected targets ..."
    case "$mode" in
        server) (cd "$repo_dir" && pnpm run build --filter=server) ;;
        nova)   (cd "$repo_dir" && pnpm run build --filter=nova) ;;
        both)   (cd "$repo_dir" && pnpm run build) ;;
    esac

    # Write env file for systemd units
    write_service_env "$repo_dir"

    # Copy unit files from repo into user systemd directory and reload daemon.
    sync_user_units_from_repo "$repo_dir"

    # Enable and start
    local units
    units=($(units_for_mode "$mode"))
    systemctl --user enable "${units[@]}"
    systemctl --user start "${units[@]}"
    echo "Enabled and started: ${units[*]}"

    echo ""
    echo "Done. Useful commands:"
    echo "  systemctl --user status $SERVER_UNIT $NOVA_UNIT"
    echo "  journalctl --user -u $SERVER_UNIT -u $NOVA_UNIT -f"
    echo "  $SCRIPT_NAME status"
    echo "  $SCRIPT_NAME logs -f"
}

cmd_update() {
    local mode="both"
    local mode_set=0
    while [[ $# -gt 0 ]]; do
        case "$1" in
            server|nova|both)
                if [[ "$mode_set" -eq 1 ]]; then
                    die "Mode specified more than once (extra value: $1). Use only one of: server, nova, both."
                fi
                mode="$(parse_mode "$1")"
                mode_set=1
                ;;
            *)
                die "Unknown argument for update: $1"
                ;;
        esac
        shift
    done
    check_systemd_user || exit 1
    check_tools git node pnpm
    local repo_dir
    repo_dir="$(get_installed_repo_dir)"
    echo "Using OpenCloud repo: $repo_dir"
    echo "Pulling latest..."
    (cd "$repo_dir" && git pull)
    echo "Installing dependencies (pnpm install)..."
    (cd "$repo_dir" && pnpm install)
    echo "Building..."
    case "$mode" in
        server) (cd "$repo_dir" && pnpm run build --filter=server) ;;
        nova)   (cd "$repo_dir" && pnpm run build --filter=nova) ;;
        both)   (cd "$repo_dir" && pnpm run build) ;;
    esac
    write_service_env "$repo_dir"
    sync_user_units_from_repo "$repo_dir"
    echo "Restarting $mode..."
    systemctl_user_units restart "$mode"
    echo "Update complete."
}

cmd_rebuild() {
    local mode="both"
    local mode_set=0
    while [[ $# -gt 0 ]]; do
        case "$1" in
            server|nova|both)
                if [[ "$mode_set" -eq 1 ]]; then
                    die "Mode specified more than once (extra value: $1). Use only one of: server, nova, both."
                fi
                mode="$(parse_mode "$1")"
                mode_set=1
                ;;
            *)
                die "Unknown argument for rebuild: $1"
                ;;
        esac
        shift
    done
    check_systemd_user || exit 1
    check_tools node pnpm
    local repo_dir
    repo_dir="$(get_installed_repo_dir)"
    echo "Using OpenCloud repo: $repo_dir"
    echo "Installing dependencies (pnpm install)..."
    (cd "$repo_dir" && pnpm install)
    echo "Building..."
    case "$mode" in
        server) (cd "$repo_dir" && pnpm run build --filter=server) ;;
        nova)   (cd "$repo_dir" && pnpm run build --filter=nova) ;;
        both)   (cd "$repo_dir" && pnpm run build) ;;
    esac
    write_service_env "$repo_dir"
    sync_user_units_from_repo "$repo_dir"
    echo "Restarting $mode..."
    systemctl_user_units restart "$mode"
    echo "Rebuild complete."
}

cmd_start() {
    check_systemd_user || exit 1
    systemctl_user_units start "${1:-both}"
}

cmd_stop() {
    check_systemd_user || exit 1
    systemctl_user_units stop "${1:-both}"
}

cmd_restart() {
    check_systemd_user || exit 1
    systemctl_user_units restart "${1:-both}"
}

cmd_status() {
    check_systemd_user || exit 1
    local mode="${1:-both}"
    local units
    units=($(units_for_mode "$mode"))
    systemctl --user status "${units[@]}" || true
}

cmd_logs() {
    check_systemd_user || exit 1
    local mode="both"
    if [[ $# -gt 0 ]]; then
        case "$1" in
            server|nova|both)
                mode="$1"
                shift
                ;;
        esac
    fi
    local units args
    units=($(units_for_mode "$mode"))
    args=()
    for u in "${units[@]}"; do args+=(-u "$u"); done
    journalctl --user "${args[@]}" "$@"
}

cmd_uninstall() {
    check_systemd_user || exit 1
    systemctl --user stop "$SERVER_UNIT" "$NOVA_UNIT" 2>/dev/null || true
    systemctl --user disable "$SERVER_UNIT" "$NOVA_UNIT" 2>/dev/null || true
    rm -f "$SYSTEMD_USER_DIR/opencloud-server.service" "$SYSTEMD_USER_DIR/opencloud-nova.service"
    systemctl --user daemon-reload
    echo "Removed user units from $SYSTEMD_USER_DIR"
    if [[ -f "$OPENCLOUD_SERVICE_ENV" ]]; then
        rm -f "$OPENCLOUD_SERVICE_ENV"
        echo "Removed $OPENCLOUD_SERVICE_ENV"
    fi
    echo "Uninstall complete. Repo and data were not removed."
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

main() {
    local cmd="${1:-}"
    shift || true
    case "$cmd" in
        install)   cmd_install "$@" ;;
        update)    cmd_update "$@" ;;
        rebuild)   cmd_rebuild "$@" ;;
        start)     cmd_start "$@" ;;
        stop)      cmd_stop "$@" ;;
        restart)   cmd_restart "$@" ;;
        status)    cmd_status "$@" ;;
        logs)      cmd_logs "$@" ;;
        uninstall) cmd_uninstall "$@" ;;
        -h|--help|help) usage ; exit 0 ;;
        *) usage ; die "Unknown command: $cmd" ;;
    esac
}

main "$@"
