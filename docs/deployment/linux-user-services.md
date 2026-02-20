# OpenCloud as a Linux user service (systemd)

Run OpenCloud (server, Nova, or both) as a **systemd user service** on Linux—no root required. Services run in your user session and survive logouts if linger is enabled.

## Prerequisites

- Linux with systemd and user session support
- Node.js **>= 22.12**
- [pnpm](https://pnpm.io/) (e.g. `corepack enable && corepack prepare pnpm@latest --activate`)
- Git (for clone-based install)
- For **server**: PostgreSQL, `.env` with `DATABASE_URL`, `FILE_STORE_PATH`, and other required variables (see [Environment](../agents/ENVIRONMENT.md))

## Quick start

From the OpenCloud repo root (after cloning and configuring `.env`):

```bash
# Optional: run database migrations first (server only)
dotenvx run --convention=nextjs -- pnpm --filter server db:migrate

# Install and start both server and Nova as user services
./scripts/linux/opencloud-user-service.sh install
```

Or clone and install in one go:

```bash
./scripts/linux/opencloud-user-service.sh install --clone=https://github.com/devmwang/OpenCloud.git
```

Then open the API at **http://localhost:8080** and Nova at **http://localhost:3000**.

## Commands

| Command     | Description                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `install`   | Set up repo (clone or use current dir), install dependencies, build, install systemd user units, and start the selected mode |
| `update`    | Pull latest from git, `pnpm install`, build, and restart (uses repo path from install)                                       |
| `rebuild`   | `pnpm install`, build, and restart without pulling (use after a manual `git pull`)                                           |
| `start`     | Start the service(s)                                                                                                         |
| `stop`      | Stop the service(s)                                                                                                          |
| `restart`   | Restart the service(s)                                                                                                       |
| `status`    | Show `systemctl --user status` for the service(s)                                                                            |
| `logs`      | Run `journalctl --user` for the service(s); pass flags like `-f` to follow                                                   |
| `uninstall` | Stop, disable, and remove user units and config                                                                              |

**Mode** (optional, default `both`): `server` | `nova` | `both`

Examples:

```bash
./scripts/linux/opencloud-user-service.sh install server          # API server only
./scripts/linux/opencloud-user-service.sh install nova            # Nova only
./scripts/linux/opencloud-user-service.sh install --repo=/path/to/OpenCloud both
./scripts/linux/opencloud-user-service.sh update                  # pull, install, build, restart both
./scripts/linux/opencloud-user-service.sh rebuild                 # install, build, restart (after manual git pull)
./scripts/linux/opencloud-user-service.sh start both
./scripts/linux/opencloud-user-service.sh status
./scripts/linux/opencloud-user-service.sh logs -f
./scripts/linux/opencloud-user-service.sh uninstall
```

## Updating OpenCloud

**Option 1 - Script does everything:** From the OpenCloud repo root, run:

```bash
./scripts/linux/opencloud-user-service.sh update
```

This pulls the latest code from git (using the repo path saved at install time), runs `pnpm install`, builds, and restarts the service(s). Add a mode to limit to one app: `update server` or `update nova`.

**Option 2 – You pull, then rebuild:** If you prefer to pull yourself (e.g. from the repo directory or with a specific branch):

```bash
cd /path/to/OpenCloud   # or wherever you installed
git pull
./scripts/linux/opencloud-user-service.sh rebuild
```

`rebuild` uses the repo path from `~/.config/opencloud/opencloud-service.env`. Use `rebuild server` or `rebuild nova` to rebuild and restart only that component.

## Install options

- **`--repo=DIR`** – Use existing OpenCloud repo at `DIR` (must be repo root).
- **`--clone=URL`** – Clone from `URL` (default clone dir: `~/OpenCloud`).
- **`--clone-dir=DIR`** – Use `DIR` as clone target when using `--clone`.

If you omit both `--repo` and `--clone`, the script uses the **current directory** if it is the OpenCloud repo root; otherwise it exits with instructions.

## Where things live

- **Config**: `~/.config/opencloud/opencloud-service.env` (sets `OPENCLOUD_REPO_DIR` for the units).
- **User units**: `~/.config/systemd/user/opencloud-server.service`, `opencloud-nova.service`.
- **Application env**: `.env` / `.env.local` in the **repo root** (used by `pnpm run start` via dotenvx).

## Troubleshooting

### "systemd user session is not available"

You need a user session with logind. On a headless or SSH-only box, enable linger so user services run without an active login:

```bash
loginctl enable-linger "$USER"
```

Then log out and back in (or reboot). After that, `systemctl --user status` should work.

### Services don’t start after reboot

Ensure linger is enabled (see above). Then:

```bash
systemctl --user enable opencloud-server opencloud-nova
systemctl --user start opencloud-server opencloud-nova
```

The `install` command already enables and starts; this is only needed if you had disabled them or reinstalled.

### pnpm or node not found when the service runs

Units run with a login shell (`bash -lc`) so your profile (and thus `PATH`) is loaded. If `pnpm` or `node` are installed via a version manager (nvm, fnm, etc.), ensure they are in the **login** shell path (e.g. in `~/.profile` or `~/.bash_profile`, not only `~/.bashrc`).

### Repo path changed (moved or re-cloned)

Update the config and reload:

```bash
echo "OPENCLOUD_REPO_DIR=/new/path/to/OpenCloud" > ~/.config/opencloud/opencloud-service.env
systemctl --user daemon-reload
systemctl --user restart opencloud-server opencloud-nova
```

Or re-run install with `--repo=/new/path/to/OpenCloud` and the desired mode.

### Viewing logs

```bash
# Follow both services
./scripts/linux/opencloud-user-service.sh logs -f

# Or with systemctl/journalctl directly
journalctl --user -u opencloud-server -u opencloud-nova -f
```

### Database or .env errors

The server reads `.env` / `.env.local` from the **repo root** at runtime. Ensure:

- `OPENCLOUD_REPO_DIR` in `~/.config/opencloud/opencloud-service.env` points at the repo that contains your `.env`.
- You’ve run migrations: `dotenvx run --convention=nextjs -- pnpm --filter server db:migrate` (from repo root).
