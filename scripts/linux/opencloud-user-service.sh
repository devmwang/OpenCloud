#!/usr/bin/env bash
# OpenCloud Linux system service setup and management.
# Legacy filename retained for compatibility.
# Usage: opencloud-user-service.sh <command> [options] [mode]
# Commands: install | update | rebuild | start | stop | restart | status | logs | uninstall
# Mode: server | nova | both (default: both where applicable)

set -euo pipefail

readonly SCRIPT_NAME="${0##*/}"
readonly MIN_NODE_VERSION="22.12.0"
readonly DEFAULT_CLONE_URL="https://github.com/devmwang/OpenCloud.git"

readonly OPENCLOUD_SERVICE_ENV="${OPENCLOUD_SERVICE_ENV:-/etc/opencloud/opencloud-service.env}"
readonly OPENCLOUD_CONFIG_DIR="${OPENCLOUD_CONFIG_DIR:-/etc/opencloud}"
readonly SYSTEMD_SYSTEM_DIR="${SYSTEMD_SYSTEM_DIR:-/etc/systemd/system}"

readonly SERVER_UNIT="opencloud-server"
readonly NOVA_UNIT="opencloud-nova"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME <command> [options] [mode]

Commands:
  install     Set up OpenCloud repo, install system units, and start selected mode
  update      Pull latest from git, pnpm install, build, and restart (uses repo from install)
  rebuild     pnpm install, build, and restart (no git pull; use after manual git pull)
  start       Start the service(s)
  stop        Stop the service(s)
  restart     Restart the service(s)
  status      Show status of the service(s)
  logs        Tail logs (journalctl) for the service(s)
  uninstall   Stop, disable, and remove system service setup

Mode (optional, default: both):
  server      API server only (port 8080)
  nova        Nova web UI only (port 3000)
  both        Server and Nova

Install options (only for 'install'):
  --repo=DIR            Use existing repo at DIR (must be OpenCloud root)
  --clone               Clone repository from default URL ($DEFAULT_CLONE_URL)
  --clone=URL           Clone repository from URL
  --clone-dir=DIR       Where to clone (default: <service-user-home>/OpenCloud)
  --service-user=USER   System account used to run services

Notes:
  --repo and --clone are mutually exclusive.
  --clone-dir requires --clone or --clone=URL.

If neither --repo nor --clone is given, install uses the current directory
if it is the OpenCloud repo root; otherwise install fails with instructions.

Examples:
  sudo $SCRIPT_NAME install
  sudo $SCRIPT_NAME install --service-user=opencloud
  sudo $SCRIPT_NAME install --repo=/path/to/OpenCloud
  sudo $SCRIPT_NAME install --clone=https://github.com/devmwang/OpenCloud.git both
  sudo $SCRIPT_NAME update
  sudo $SCRIPT_NAME rebuild
  sudo $SCRIPT_NAME start both
  sudo $SCRIPT_NAME status
  sudo $SCRIPT_NAME logs -f
EOF
}

err() {
    echo "$SCRIPT_NAME: $*" >&2
}

die() {
    err "$*"
    exit 1
}

is_root() {
    [[ "$(id -u)" -eq 0 ]]
}

run_root() {
    if is_root; then
        "$@"
        return
    fi
    if ! command -v sudo &>/dev/null; then
        die "This command requires root privileges. Re-run with sudo."
    fi
    sudo "$@"
}

run_as_user_shell() {
    local user="$1"
    local shell_cmd="$2"

    if [[ -z "$user" ]]; then
        die "run_as_user_shell called without a user"
    fi

    if [[ "$(id -un)" == "$user" ]]; then
        bash -lc "$shell_cmd"
        return
    fi

    if command -v sudo &>/dev/null; then
        sudo -H -u "$user" bash -lc "$shell_cmd"
        return
    fi

    if is_root; then
        su - "$user" -s /bin/bash -c "$shell_cmd"
        return
    fi

    die "Cannot run command as user '$user' because sudo is not available."
}

# Run command as user after loading nvm and switching to nvm default (if nvm is installed).
run_as_user_with_nvm_shell() {
    local user="$1"
    local shell_cmd="$2"
    local nvm_prefix='export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; if [[ -s "$NVM_DIR/nvm.sh" ]]; then . "$NVM_DIR/nvm.sh"; nvm use --silent default >/dev/null; fi'
    run_as_user_shell "$user" "$nvm_prefix; $shell_cmd"
}

ensure_user_exists() {
    local user="$1"
    if ! id -u -- "$user" &>/dev/null; then
        die "User '$user' does not exist."
    fi
}

default_service_user() {
    if [[ -n "${SUDO_USER:-}" ]] && [[ "${SUDO_USER}" != "root" ]]; then
        echo "$SUDO_USER"
    else
        id -un
    fi
}

get_user_home() {
    local user="$1"
    ensure_user_exists "$user"
    local home_dir=""
    if command -v getent &>/dev/null; then
        home_dir="$(getent passwd "$user" 2>/dev/null | cut -d: -f6)"
    fi
    if [[ -z "$home_dir" ]]; then
        home_dir="$(run_as_user_shell "$user" 'printf "%s" "$HOME"')"
    fi
    if [[ -z "$home_dir" ]] || [[ ! -d "$home_dir" ]]; then
        die "Could not resolve a valid home directory for user '$user'."
    fi
    echo "$home_dir"
}

escape_for_double_quotes() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    echo "$value"
}

shell_quote() {
    printf "%q" "$1"
}

sed_escape_replacement() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//&/\\&}"
    value="${value//|/\\|}"
    echo "$value"
}

# Resolve repo root: print absolute path or empty if not OpenCloud repo.
get_repo_root() {
    local dir="${1:-}"
    if [[ -z "$dir" ]]; then
        return 1
    fi

    local root
    if [[ -e "$dir/.git" ]] && [[ -f "$dir/package.json" ]]; then
        if grep -q '"name"[[:space:]]*:[[:space:]]*"opencloud"' "$dir/package.json" 2>/dev/null; then
            root="$(cd "$dir" && pwd)"
            echo "$root"
            return
        fi
    fi

    return 1
}

read_service_env_value() {
    local key="$1"
    if [[ ! -f "$OPENCLOUD_SERVICE_ENV" ]]; then
        return 1
    fi

    local value
    value="$(grep -E "^${key}=" "$OPENCLOUD_SERVICE_ENV" 2>/dev/null | head -n 1 | cut -d= -f2- | sed "s/^['\"]//;s/['\"]$//")"
    if [[ -z "$value" ]]; then
        return 1
    fi

    echo "$value"
}

# Resolve repo directory used by installed system units (from opencloud-service.env).
# Prints absolute path; exits with message if not installed.
get_installed_repo_dir() {
    local dir
    if ! dir="$(read_service_env_value OPENCLOUD_REPO_DIR)"; then
        die "OpenCloud system service not installed (missing OPENCLOUD_REPO_DIR in $OPENCLOUD_SERVICE_ENV). Run: sudo $SCRIPT_NAME install"
    fi

    if [[ ! -d "$dir" ]]; then
        die "Invalid OPENCLOUD_REPO_DIR in $OPENCLOUD_SERVICE_ENV: $dir"
    fi

    echo "$(cd "$dir" && pwd)"
}

get_installed_service_user() {
    local user
    user="$(read_service_env_value OPENCLOUD_SERVICE_USER || true)"

    if [[ -z "$user" ]] && [[ -f "$SYSTEMD_SYSTEM_DIR/$SERVER_UNIT.service" ]]; then
        user="$(grep -E '^User=' "$SYSTEMD_SYSTEM_DIR/$SERVER_UNIT.service" 2>/dev/null | head -n 1 | cut -d= -f2-)"
    fi

    if [[ -z "$user" ]] && [[ -f "$SYSTEMD_SYSTEM_DIR/$NOVA_UNIT.service" ]]; then
        user="$(grep -E '^User=' "$SYSTEMD_SYSTEM_DIR/$NOVA_UNIT.service" 2>/dev/null | head -n 1 | cut -d= -f2-)"
    fi

    if [[ -z "$user" ]]; then
        user="$(default_service_user)"
    fi

    ensure_user_exists "$user"
    echo "$user"
}

check_systemd_system() {
    if ! command -v systemctl &>/dev/null; then
        err "systemctl not found; this script requires systemd."
        return 1
    fi

    if ! run_root systemctl show-environment &>/dev/null; then
        err "systemd system manager is not available."
        return 1
    fi

    return 0
}

# Check Linux (optional but warn on other OS)
check_linux() {
    local os
    os="$(uname -s 2>/dev/null || true)"
    if [[ "$os" != "Linux" ]]; then
        err "This script is intended for Linux (detected: $os). Some steps may fail."
    fi
}

# Ensure required tools exist for the target service user.
check_tools_for_user() {
    local user="$1"
    shift

    local required_tools=("$@")
    if [[ ${#required_tools[@]} -eq 0 ]]; then
        required_tools=(git node pnpm)
    fi

    local missing=()
    local cmd
    for cmd in "${required_tools[@]}"; do
        local cmd_q
        cmd_q="$(shell_quote "$cmd")"
        if ! run_as_user_with_nvm_shell "$user" "command -v $cmd_q >/dev/null 2>&1"; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        die "Missing required tools for user '$user': ${missing[*]}. Install git (if needed), Node.js (>=$MIN_NODE_VERSION), and pnpm (e.g. corepack enable && corepack prepare pnpm@latest --activate)."
    fi
}

semver_part() {
    local raw="$1"
    raw="${raw%%[^0-9]*}"
    if [[ -z "$raw" ]]; then
        raw=0
    fi
    echo "$raw"
}

semver_gte() {
    local current="${1#v}"
    local required="${2#v}"

    local c1 c2 c3 r1 r2 r3
    IFS='.' read -r c1 c2 c3 <<< "$current"
    IFS='.' read -r r1 r2 r3 <<< "$required"

    c1="$(semver_part "${c1:-0}")"
    c2="$(semver_part "${c2:-0}")"
    c3="$(semver_part "${c3:-0}")"

    r1="$(semver_part "${r1:-0}")"
    r2="$(semver_part "${r2:-0}")"
    r3="$(semver_part "${r3:-0}")"

    if (( c1 > r1 )); then return 0; fi
    if (( c1 < r1 )); then return 1; fi

    if (( c2 > r2 )); then return 0; fi
    if (( c2 < r2 )); then return 1; fi

    if (( c3 >= r3 )); then return 0; fi
    return 1
}

check_node_version_for_user() {
    local user="$1"
    local node_version

    if ! node_version="$(run_as_user_with_nvm_shell "$user" "node -p 'process.versions.node'")"; then
        die "Unable to determine Node.js version for user '$user'."
    fi

    if ! semver_gte "$node_version" "$MIN_NODE_VERSION"; then
        die "Node.js $node_version is unsupported for user '$user'. OpenCloud requires Node.js >= $MIN_NODE_VERSION. Upgrade Node.js for '$user' and rerun."
    fi
}

# Resolve pnpm binary path used by systemd units.
resolve_pnpm_bin_for_user() {
    local user="$1"
    local candidate="${PNPM_BIN:-pnpm}"
    local resolved
    local candidate_q
    candidate_q="$(shell_quote "$candidate")"

    resolved="$(run_as_user_with_nvm_shell "$user" "command -v $candidate_q" 2>/dev/null || true)"
    if [[ -z "$resolved" ]]; then
        die "Could not resolve pnpm binary from PNPM_BIN=$candidate for user '$user'. Ensure pnpm is installed and on PATH."
    fi

    echo "$resolved"
}

# Write environment file consumed by systemd system units.
write_service_env() {
    local repo_dir="$1"
    local service_user="$2"

    local pnpm_bin
    pnpm_bin="$(resolve_pnpm_bin_for_user "$service_user")"

    local repo_dir_escaped pnpm_bin_escaped service_user_escaped
    repo_dir_escaped="$(escape_for_double_quotes "$repo_dir")"
    pnpm_bin_escaped="$(escape_for_double_quotes "$pnpm_bin")"
    service_user_escaped="$(escape_for_double_quotes "$service_user")"

    local tmp_env
    tmp_env="$(mktemp)"
    printf 'OPENCLOUD_REPO_DIR="%s"\nPNPM_BIN="%s"\nOPENCLOUD_SERVICE_USER="%s"\n' \
        "$repo_dir_escaped" "$pnpm_bin_escaped" "$service_user_escaped" > "$tmp_env"

    local service_env_dir
    service_env_dir="$(dirname "$OPENCLOUD_SERVICE_ENV")"
    if [[ -z "$service_env_dir" ]] || [[ "$service_env_dir" == "." ]]; then
        service_env_dir="$OPENCLOUD_CONFIG_DIR"
    fi

    run_root mkdir -p "$service_env_dir"
    run_root install -m 0644 "$tmp_env" "$OPENCLOUD_SERVICE_ENV"
    rm -f "$tmp_env"

    echo "Wrote $OPENCLOUD_SERVICE_ENV"
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
        *)      die "Invalid mode: $mode" ;;
    esac
}

other_units_for_mode() {
    local mode="$1"
    case "$mode" in
        server) echo "$NOVA_UNIT" ;;
        nova)   echo "$SERVER_UNIT" ;;
        both)   ;;
        *)      die "Invalid mode: $mode" ;;
    esac
}

# Run systemctl for given units (e.g. start, stop).
systemctl_system_units() {
    local action="$1"
    shift
    local units
    units=($(units_for_mode "${1:-both}"))
    run_root systemctl "$action" "${units[@]}"
}

# Install OpenCloud unit files from a repo and reload systemd daemon.
sync_system_units_from_repo() {
    local repo_dir="$1"
    local service_user="$2"
    local deploy_units="$repo_dir/deploy/systemd/system"

    if [[ ! -d "$deploy_units" ]]; then
        die "Unit files not found at $deploy_units"
    fi

    local tmp_server tmp_nova
    tmp_server="$(mktemp)"
    tmp_nova="$(mktemp)"

    local service_user_sed
    service_user_sed="$(sed_escape_replacement "$service_user")"
    local service_env_sed
    service_env_sed="$(sed_escape_replacement "$OPENCLOUD_SERVICE_ENV")"

    sed \
        -e "s|__OPENCLOUD_SERVICE_USER__|$service_user_sed|g" \
        -e "s|__OPENCLOUD_SERVICE_ENV__|$service_env_sed|g" \
        "$deploy_units/opencloud-server.service" > "$tmp_server"
    sed \
        -e "s|__OPENCLOUD_SERVICE_USER__|$service_user_sed|g" \
        -e "s|__OPENCLOUD_SERVICE_ENV__|$service_env_sed|g" \
        "$deploy_units/opencloud-nova.service" > "$tmp_nova"

    run_root mkdir -p "$SYSTEMD_SYSTEM_DIR"
    run_root install -m 0644 "$tmp_server" "$SYSTEMD_SYSTEM_DIR/opencloud-server.service"
    run_root install -m 0644 "$tmp_nova" "$SYSTEMD_SYSTEM_DIR/opencloud-nova.service"

    rm -f "$tmp_server" "$tmp_nova"

    echo "Installed unit files to $SYSTEMD_SYSTEM_DIR"
    run_root systemctl daemon-reload
    echo "Reloaded systemd daemon"
}

warn_if_legacy_user_units() {
    local service_user="$1"
    local user_home legacy_dir

    user_home="$(get_user_home "$service_user")"
    legacy_dir="$user_home/.config/systemd/user"

    if [[ -f "$legacy_dir/opencloud-server.service" ]] || [[ -f "$legacy_dir/opencloud-nova.service" ]]; then
        err "Detected legacy user-level OpenCloud units in $legacy_dir."
        err "Disable/remove them to avoid confusion with system units."
    fi
}

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------

cmd_install() {
    local mode="both"
    local mode_set=0
    local service_user_set=0
    local repo_dir=""
    local clone_url=""
    local clone_dir=""
    local service_user=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --repo=*) repo_dir="${1#--repo=}" ;;
            --clone) clone_url="$DEFAULT_CLONE_URL" ;;
            --clone=*) clone_url="${1#--clone=}" ;;
            --clone-dir=*) clone_dir="${1#--clone-dir=}" ;;
            --service-user=*)
                service_user="${1#--service-user=}"
                service_user_set=1
                ;;
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

    if [[ -n "$repo_dir" ]] && [[ -n "$clone_url" ]]; then
        die "Use either --repo=DIR or --clone, not both."
    fi
    if [[ -n "$clone_dir" ]] && [[ -z "$clone_url" ]]; then
        die "--clone-dir requires --clone or --clone=URL."
    fi
    if [[ "$service_user_set" -eq 1 ]] && [[ -z "$service_user" ]]; then
        die "--service-user requires a non-empty value."
    fi

    check_linux
    check_systemd_system || exit 1

    if [[ -z "$service_user" ]]; then
        service_user="$(default_service_user)"
    fi
    ensure_user_exists "$service_user"

    if [[ -z "$clone_dir" ]]; then
        clone_dir="$(get_user_home "$service_user")/OpenCloud"
    fi
    if [[ "$clone_dir" == "~" ]]; then
        clone_dir="$(get_user_home "$service_user")"
    elif [[ "$clone_dir" == "~/"* ]]; then
        clone_dir="$(get_user_home "$service_user")/${clone_dir#~/}"
    elif [[ "$clone_dir" != /* ]]; then
        clone_dir="$PWD/$clone_dir"
    fi

    local required_tools=(node pnpm)
    if [[ -n "$clone_url" ]]; then
        required_tools+=(git)
    fi
    check_tools_for_user "$service_user" "${required_tools[@]}"
    check_node_version_for_user "$service_user"

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
        local clone_parent
        clone_parent="$(dirname "$clone_dir")"
        local clone_parent_q
        clone_parent_q="$(shell_quote "$clone_parent")"
        run_as_user_shell "$service_user" "mkdir -p $clone_parent_q"

        if [[ -e "$clone_dir/.git" ]]; then
            if ! get_repo_root "$clone_dir" &>/dev/null; then
                die "Refusing to pull: $clone_dir is a git repo but not OpenCloud. Use a different --clone-dir or --repo=DIR."
            fi
            echo "Pulling existing OpenCloud clone at $clone_dir ..."
            local clone_dir_q
            clone_dir_q="$(shell_quote "$clone_dir")"
            run_as_user_shell "$service_user" "cd $clone_dir_q && git pull"
        else
            echo "Cloning OpenCloud into $clone_dir ..."
            local clone_url_q clone_dir_q
            clone_url_q="$(shell_quote "$clone_url")"
            clone_dir_q="$(shell_quote "$clone_dir")"
            run_as_user_shell "$service_user" "git clone $clone_url_q $clone_dir_q"
        fi

        repo_dir="$(get_repo_root "$clone_dir")" || die "Cloned directory is not OpenCloud root: $clone_dir"
    else
        repo_dir="$(get_repo_root .)" || die "Current directory is not the OpenCloud repo root. Run from repo root or use --repo=DIR or --clone=URL."
    fi

    echo "Using OpenCloud repo: $repo_dir"
    echo "Service user: $service_user"

    # Install dependencies and build selected targets as the service user.
    echo "Installing dependencies (pnpm install) ..."
    local repo_dir_q
    repo_dir_q="$(shell_quote "$repo_dir")"
    run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm install"

    echo "Building selected targets ..."
    case "$mode" in
        server) run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build --filter=server" ;;
        nova)   run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build --filter=nova" ;;
        both)   run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build" ;;
    esac

    # Write env file for systemd units and install unit files.
    write_service_env "$repo_dir" "$service_user"
    sync_system_units_from_repo "$repo_dir" "$service_user"

    # Ensure install mode is authoritative: disable units not selected.
    local other_units=()
    while IFS= read -r unit; do
        if [[ -n "$unit" ]]; then
            other_units+=("$unit")
        fi
    done < <(other_units_for_mode "$mode")
    if [[ ${#other_units[@]} -gt 0 ]]; then
        run_root systemctl disable --now "${other_units[@]}" 2>/dev/null || true
        echo "Disabled services not selected by mode: ${other_units[*]}"
    fi

    # Enable and start selected units.
    local units
    units=($(units_for_mode "$mode"))
    run_root systemctl enable "${units[@]}"
    run_root systemctl start "${units[@]}"
    echo "Enabled and started: ${units[*]}"

    warn_if_legacy_user_units "$service_user"

    echo ""
    echo "Done. Useful commands:"
    echo "  sudo systemctl status $SERVER_UNIT $NOVA_UNIT"
    echo "  sudo journalctl -u $SERVER_UNIT -u $NOVA_UNIT -f"
    echo "  sudo $SCRIPT_NAME status"
    echo "  sudo $SCRIPT_NAME logs -f"
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

    check_systemd_system || exit 1

    local repo_dir service_user
    repo_dir="$(get_installed_repo_dir)"
    service_user="$(get_installed_service_user)"

    check_tools_for_user "$service_user" git node pnpm
    check_node_version_for_user "$service_user"

    echo "Using OpenCloud repo: $repo_dir"
    echo "Service user: $service_user"
    local repo_dir_q
    repo_dir_q="$(shell_quote "$repo_dir")"

    echo "Pulling latest ..."
    run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && git pull"

    echo "Installing dependencies (pnpm install) ..."
    run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm install"

    echo "Building ..."
    case "$mode" in
        server) run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build --filter=server" ;;
        nova)   run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build --filter=nova" ;;
        both)   run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build" ;;
    esac

    write_service_env "$repo_dir" "$service_user"
    sync_system_units_from_repo "$repo_dir" "$service_user"

    echo "Restarting $mode ..."
    systemctl_system_units restart "$mode"
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

    check_systemd_system || exit 1

    local repo_dir service_user
    repo_dir="$(get_installed_repo_dir)"
    service_user="$(get_installed_service_user)"

    check_tools_for_user "$service_user" node pnpm
    check_node_version_for_user "$service_user"

    echo "Using OpenCloud repo: $repo_dir"
    echo "Service user: $service_user"
    local repo_dir_q
    repo_dir_q="$(shell_quote "$repo_dir")"

    echo "Installing dependencies (pnpm install) ..."
    run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm install"

    echo "Building ..."
    case "$mode" in
        server) run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build --filter=server" ;;
        nova)   run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build --filter=nova" ;;
        both)   run_as_user_with_nvm_shell "$service_user" "cd $repo_dir_q && pnpm run build" ;;
    esac

    write_service_env "$repo_dir" "$service_user"
    sync_system_units_from_repo "$repo_dir" "$service_user"

    echo "Restarting $mode ..."
    systemctl_system_units restart "$mode"
    echo "Rebuild complete."
}

cmd_start() {
    check_systemd_system || exit 1
    systemctl_system_units start "${1:-both}"
}

cmd_stop() {
    check_systemd_system || exit 1
    systemctl_system_units stop "${1:-both}"
}

cmd_restart() {
    check_systemd_system || exit 1
    systemctl_system_units restart "${1:-both}"
}

cmd_status() {
    check_systemd_system || exit 1
    local mode="${1:-both}"
    local units
    units=($(units_for_mode "$mode"))
    run_root systemctl status "${units[@]}" || true
}

cmd_logs() {
    check_systemd_system || exit 1

    local mode="both"
    local mode_set=0
    local pass_args=()

    # Backward compatibility: allow mode as the first positional token.
    if [[ $# -gt 0 ]]; then
        case "$1" in
            server|nova|both)
                mode="$(parse_mode "$1")"
                mode_set=1
                shift
                ;;
        esac
    fi

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --mode=*)
                if [[ "$mode_set" -eq 1 ]]; then
                    die "Mode specified more than once for logs."
                fi
                mode="$(parse_mode "${1#--mode=}")"
                mode_set=1
                ;;
            --mode)
                if [[ "$mode_set" -eq 1 ]]; then
                    die "Mode specified more than once for logs."
                fi
                shift
                if [[ $# -eq 0 ]]; then
                    die "--mode requires a value (server, nova, or both)."
                fi
                mode="$(parse_mode "$1")"
                mode_set=1
                ;;
            *)
                pass_args+=("$1")
                ;;
        esac
        shift
    done

    local units args
    units=($(units_for_mode "$mode"))
    args=()
    for u in "${units[@]}"; do
        args+=(-u "$u")
    done

    run_root journalctl "${args[@]}" "${pass_args[@]}"
}

cmd_uninstall() {
    check_systemd_system || exit 1

    run_root systemctl stop "$SERVER_UNIT" "$NOVA_UNIT" 2>/dev/null || true
    run_root systemctl disable "$SERVER_UNIT" "$NOVA_UNIT" 2>/dev/null || true

    run_root rm -f "$SYSTEMD_SYSTEM_DIR/opencloud-server.service" "$SYSTEMD_SYSTEM_DIR/opencloud-nova.service"
    run_root systemctl daemon-reload
    echo "Removed system units from $SYSTEMD_SYSTEM_DIR"

    if run_root test -f "$OPENCLOUD_SERVICE_ENV"; then
        run_root rm -f "$OPENCLOUD_SERVICE_ENV"
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
