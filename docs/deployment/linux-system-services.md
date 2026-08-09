# OpenCloud as a Linux system service (systemd)

Run OpenCloud (server, Nova, or both) as a systemd system service on Linux.
Services are installed under `/etc/systemd/system` and can start at boot.

## Prerequisites

- Linux with systemd
- Root access (`sudo`) for service install/manage commands
- Node.js `>= 22.12.0` for the service user account
- [pnpm](https://pnpm.io/) (for example: `corepack enable && corepack prepare pnpm@latest --activate`)
- Git (for clone-based install)
- For **server**: PostgreSQL, `.env` with `DATABASE_URL`, `FILE_STORE_PATH`, and other required variables (see [Environment](../agents/ENVIRONMENT.md))

## Quick start

From the OpenCloud repo root (after cloning and configuring `.env`):

```bash
# Install and start both server and Nova as system services
sudo ./scripts/linux/opencloud-user-service.sh install
```

For `server` and `both`, `install` applies all Server database migrations before it enables or starts the services. Migration failure prevents startup. `install nova` does not run Server migrations.

Or clone and install in one go:

```bash
sudo ./scripts/linux/opencloud-user-service.sh install --clone=https://github.com/devmwang/OpenCloud.git
```

Then open the API at **http://localhost:8080** and Nova at **http://localhost:3000**.

## Commands

| Command     | Description                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `install`   | Set up repo, install dependencies, build, install units, migrate Server modes, then start the selected mode; migration failure prevents startup |
| `update`    | Pull latest from git, then run the current rebuild path (uses repo path from install)                                                           |
| `rebuild`   | `pnpm install`, build, stop and migrate the Server for `server` or `both`, and restart without pulling                                          |
| `start`     | Start the service(s)                                                                                                                            |
| `stop`      | Stop the service(s)                                                                                                                             |
| `restart`   | Restart the service(s)                                                                                                                          |
| `status`    | Show `systemctl status` for the service(s)                                                                                                      |
| `logs`      | Run `journalctl` for the service(s); pass flags like `-f` to follow                                                                             |
| `uninstall` | Stop, disable, and remove system units and config                                                                                               |

**Mode** (optional, default `both`): `server` | `nova` | `both`

Examples:

```bash
sudo ./scripts/linux/opencloud-user-service.sh install server
sudo ./scripts/linux/opencloud-user-service.sh install nova
sudo ./scripts/linux/opencloud-user-service.sh install --repo=/path/to/OpenCloud both
sudo ./scripts/linux/opencloud-user-service.sh install --service-user=opencloud both
sudo ./scripts/linux/opencloud-user-service.sh update
sudo ./scripts/linux/opencloud-user-service.sh rebuild
sudo ./scripts/linux/opencloud-user-service.sh start both
sudo ./scripts/linux/opencloud-user-service.sh status
sudo ./scripts/linux/opencloud-user-service.sh logs -f
sudo ./scripts/linux/opencloud-user-service.sh logs server --since today
sudo ./scripts/linux/opencloud-user-service.sh logs --mode=server --since today
sudo ./scripts/linux/opencloud-user-service.sh uninstall
```

## Updating OpenCloud

Option 1: script does everything.

```bash
sudo ./scripts/linux/opencloud-user-service.sh update
```

This pulls the latest code from git and then loads the updated script's `rebuild` path. For `server` and `both`, the rebuild stops the Server, applies database migrations, and restarts the selected services only after migration success. Migration failure leaves the Server stopped. `update nova` does not stop or migrate the Server.

For the first update from an older script that does not run migrations, load the new script before rebuilding:

```bash
cd /path/to/OpenCloud
git pull --ff-only
sudo ./scripts/linux/opencloud-user-service.sh rebuild both
```

Replace `both` with the installed mode when the installation runs only `server` or `nova`. Do not use the older `update` implementation for this one transition. Its running Bash process cannot load the script changes that it pulls.

Option 2: pull manually, then rebuild.

```bash
cd /path/to/OpenCloud
git pull
sudo ./scripts/linux/opencloud-user-service.sh rebuild
```

`rebuild` uses the repo path from `/etc/opencloud/opencloud-service.env`. Use `rebuild server` or `rebuild nova` to rebuild and restart only that component. `rebuild server` and the default `rebuild` stop the Server, apply migrations, and restart only after migration success.

## Install options

- `--repo=DIR`: Use an existing OpenCloud repo at `DIR` (must be repo root).
- `--clone=URL`: Clone from `URL`.
- `--clone-dir=DIR`: Use `DIR` as clone target when using `--clone` (cannot be used by itself).
- `--service-user=USER`: Linux account that systemd runs the services as.
- For `logs`, mode can be first positional (`logs server ...`) or explicit (`logs --mode=server ...`).

`--repo` and `--clone` are mutually exclusive.
Relative `--clone-dir` paths are resolved from the current working directory.
If you omit both `--repo` and `--clone`, the script uses the current directory if it is the OpenCloud repo root; otherwise it exits with instructions.

## Where things live

- Config: `/etc/opencloud/opencloud-service.env` (includes `OPENCLOUD_REPO_DIR`, `PNPM_BIN`, and `OPENCLOUD_SERVICE_USER`).
- System units: `/etc/systemd/system/opencloud-server.service`, `/etc/systemd/system/opencloud-nova.service`.
- Unit templates in repo: `deploy/systemd/system/opencloud-server.service`, `deploy/systemd/system/opencloud-nova.service` (placeholders are rendered by the install script).
- Application env: `.env` / `.env.local` in the repo root (used by `pnpm run start` via dotenvx).

## Troubleshooting

### Node version check fails

OpenCloud requires Node.js `>= 22.12.0`. If you use nvm, set the service user's default alias to a supported version, then rerun install/update/rebuild:

```bash
nvm alias default 22
```

### Services do not start after install

Check status and logs:

```bash
sudo systemctl status opencloud-server opencloud-nova
sudo journalctl -u opencloud-server -u opencloud-nova -f
```

### pnpm or node not found when the service runs

System units load `nvm` from `%h/.nvm` (for the configured service user) and run with `nvm`'s `default` alias when available. For `pnpm`, units try:

1. `pnpm` on `PATH` (with `PNPM_HOME=%h/.local/share/pnpm` prepended)
2. `corepack pnpm`
3. `PNPM_BIN` from `/etc/opencloud/opencloud-service.env` (installer-resolved fallback)

If needed, set the default alias and enable pnpm via corepack:

```bash
nvm alias default 22
corepack enable
corepack prepare pnpm@latest --activate
```

### Migrating from older user-level units

If you previously installed user-level units (`systemctl --user`), disable them before `install`, `update`, or `rebuild`:

```bash
systemctl --user disable --now opencloud-server opencloud-nova
rm -f ~/.config/systemd/user/opencloud-server.service ~/.config/systemd/user/opencloud-nova.service
systemctl --user daemon-reload
```

Before any Server migration, the service script checks the system service user and the invoking `sudo` user. The legacy `opencloud-server` user unit must be disabled and inactive. If it is not, the script stops before migration and prints the exact `systemctl --user disable --now` command.

### Repo path changed (moved or re-cloned)

Re-run install with the new path:

```bash
sudo ./scripts/linux/opencloud-user-service.sh install --repo=/new/path/to/OpenCloud both
```

### Database or `.env` errors

The server reads `.env` / `.env.local` from the repo root at runtime. Ensure:

- `OPENCLOUD_REPO_DIR` in `/etc/opencloud/opencloud-service.env` points at the repo that contains your `.env`.
- You have run migrations: `dotenvx run --convention=nextjs -- pnpm --filter server db:migrate` (from repo root).
