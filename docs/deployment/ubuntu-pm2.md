# Deploy OpenCloud on Ubuntu Server 24.04 LTS

Ubuntu Server 24.04 LTS is the only supported Linux target. PM2 runs one built Server process and one built Nova process. The deployment does not install or configure Node.js, pnpm, Git, PostgreSQL, a reverse proxy, or a service user.

## Requirements

Use one normal user for the repository and PM2. Do not run the deployment script with `sudo`.

Before you continue, confirm these requirements:

- Ubuntu Server 24.04 LTS
- Git
- Node.js 22.12.0 or later
- the pnpm version selected by Corepack from `package.json`
- PM2 available as `pm2`
- PostgreSQL available through `DATABASE_URL`
- an OpenCloud checkout owned by the PM2 user

Run these checks:

```bash
source /etc/os-release && printf '%s %s\n' "$ID" "$VERSION_ID"
node --version
pnpm --version
pm2 --version
```

The first command must print `ubuntu 24.04`. See the [PM2 installation guide](https://pm2.keymetrics.io/docs/usage/quick-start/) if `pm2` is not installed.

## Remove an old OpenCloud supervisor once

Complete only the transition that applies to this host. Do this before the first PM2 deployment. Two supervisors must not run OpenCloud at the same time.

### Old OpenCloud system services

If the old repository installer created system services, run:

```bash
sudo systemctl disable --now opencloud-server.service opencloud-nova.service
sudo rm -f /etc/systemd/system/opencloud-server.service /etc/systemd/system/opencloud-nova.service
sudo rm -f /etc/opencloud/opencloud-service.env
sudo systemctl daemon-reload
```

If an older installation created user services, run this block as that user:

```bash
systemctl --user disable --now opencloud-server.service opencloud-nova.service
rm -f "$HOME/.config/systemd/user/opencloud-server.service" "$HOME/.config/systemd/user/opencloud-nova.service"
systemctl --user daemon-reload
```

### Old manual PM2 process

Inspect each possible process before you remove it:

```bash
pm2 list
process_id=0 # Replace 0 with the old OpenCloud process ID.
pm2 describe "$process_id"
pm2 delete "$process_id"
pm2 save --force
```

Remove only an old OpenCloud process that runs `pnpm run start`, Turbo, or an old OpenCloud script. Do not use `pm2 delete all`; the PM2 user can own other applications.

## Configure startup once

Run this command without `sudo`:

```bash
pm2 startup
```

PM2 prints one host-specific `sudo env PATH=... pm2 startup systemd ...` command. Run that exact command. It records the current user, home directory, Node.js path, and PM2 path. See the [PM2 startup guide](https://pm2.keymetrics.io/docs/usage/startup/).

If the Node.js installation path changes, replace the old startup unit:

```bash
pm2 unstartup
pm2 startup
```

Run the new host-specific `sudo` command that `pm2 startup` prints.

## First deployment

Clone the repository, enter it, and create the root environment file:

```bash
git clone https://github.com/devmwang/OpenCloud.git
cd OpenCloud
cp .env.example .env
```

Set every required value in `.env`. A relative `FILE_STORE_PATH` is relative to `apps/server`, as it is for the package start command.

Deploy both applications:

```bash
./scripts/linux/deploy.sh
```

The script installs the locked dependencies, builds both applications, removes only the two OpenCloud PM2 entries, saves that stopped state, applies the Server migration, starts the built outputs, and saves the final PM2 list. PM2 does not run Turbo.

## Update

The deployment script does not pull code. Confirm that the checkout has no local change, pull with a fast-forward, and deploy the checked-out revision:

```bash
cd /path/to/OpenCloud
if [[ -n "$(git status --porcelain)" ]]; then
    echo "The checkout has local changes." >&2
else
    git pull --ff-only
    ./scripts/linux/deploy.sh
fi
```

Do not use `pm2 update` to deploy OpenCloud; that command updates the PM2 daemon.

## Migration or deployment failure

The script deletes the two OpenCloud PM2 entries and runs `pm2 save --force` before migration. If migration fails, Server and Nova remain absent from the current and saved PM2 lists. A reboot does not retry them.

Fix the reported error. Then run this explicit retry from the same checkout:

```bash
./scripts/linux/deploy.sh
```

Do not run `pm2 resurrect` or start either application by hand after a failed migration. The retry repeats the build and migration before it starts either application.

## Verify the deployment

```bash
pm2 status
pm2 describe opencloud-server
pm2 describe opencloud-nova
curl --fail --silent --show-error http://127.0.0.1:8080/v1/health
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null
sudo systemctl status "pm2-$USER" --no-pager
```

Both PM2 entries must be `online`. Use `pm2 logs opencloud-server` or `pm2 logs opencloud-nova` for application logs.

Test boot persistence once during the first deployment:

```bash
sudo reboot
```

After the host returns, run `pm2 status` and both `curl` commands again.

PM2 loads the root environment when the deployment starts the processes. The ecosystem file keeps `apps/server` and `apps/nova` as their working directories. This preserves Server paths such as a relative `FILE_STORE_PATH`.
