# HRMS cPanel Publish Guide

This package contains the Employee Management System frontend build and the
source code needed to build/run the API on cPanel. No passwords, database
URLs, or secrets are included.

## Recommended URLs

```text
Frontend: https://YOUR_DOMAIN/hrmslive/
API:      https://YOUR_DOMAIN/hrmslive-api/
```

The frontend build in this package is configured for `/hrmslive/` and
`/hrmslive-api`. If you use different paths, rebuild the frontend with:

```bash
BASE_PATH=/YOUR_FRONTEND_PATH/ \
VITE_API_BASE_PATH=/YOUR_API_APP_PATH \
NODE_ENV=production \
pnpm --filter @workspace/ems run build
```

Company administrators can create separate workspaces from the public signup
page. Existing records are kept together in the legacy company workspace;
new signups receive a separate tenant and cannot see or manage another
company's records or biometric devices.

## 1. Upload the frontend

Extract `frontend.zip` into:

```text
public_html/hrmslive/
```

The folder should directly contain `index.html`, `assets/`, and `.htaccess`.
Do not create an extra nested `frontend` folder.

Open:

```text
https://YOUR_DOMAIN/hrmslive/
```

## 2. Create the PostgreSQL database

Create a PostgreSQL database and user in cPanel. PostgreSQL is required; this
project does not use MySQL or SQLite.

Use this format for the connection string:

```env
DATABASE_URL=postgresql://DB_USER:URL_ENCODED_PASSWORD@127.0.0.1:5432/DB_NAME
```

## 3. Install/build the API

Extract the package so its `source/` directory is at `~/hrms-deploy/source`.
That directory is the pnpm workspace. On cPanel Terminal:

```bash
cd ~/hrms-deploy/source
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
```

If `pnpm` is unavailable, ask the host to enable Node.js 20+ and pnpm/Corepack.

Create the database tables:

```bash
DATABASE_URL='postgresql://DB_USER:URL_ENCODED_PASSWORD@127.0.0.1:5432/DB_NAME' \
pnpm --filter @workspace/db run push
```

For an existing installation, back up the database first, then run this schema
push before starting the updated API. Existing rows receive tenant ID `1` and
remain in the existing workspace; the migration does not delete application
records.

## 4. Create the cPanel Node.js App

In **Setup Node.js App**, use:

```text
Node version:       20.x or newer
Application root:   /home/CPANEL_USER/hrms-deploy/source
Application URL:    /hrmslive-api
Startup file:       artifacts/api-server/dist/index.mjs
Application mode:   Production
```

Add these environment variables in the Node.js app:

```env
NODE_ENV=production
DATABASE_URL=postgresql://DB_USER:URL_ENCODED_PASSWORD@127.0.0.1:5432/DB_NAME
SESSION_SECRET=YOUR_LONG_RANDOM_SECRET
```

Use the cPanel-assigned `PORT` if cPanel does not provide it automatically.
Never place these values in frontend files or in GitHub.

Restart the Node.js application and test:

```text
https://YOUR_DOMAIN/hrmslive-api/api/healthz
```

## 5. Update after a GitHub push

```bash
cd ~/hrms-deploy/source
# Run git pull only if this source directory is a Git clone. For a ZIP install,
# upload and extract the updated package instead.
git pull origin main
pnpm install --frozen-lockfile
DATABASE_URL='postgresql://DB_USER:URL_ENCODED_PASSWORD@127.0.0.1:5432/DB_NAME' \
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build

BASE_PATH=/hrmslive/ \
VITE_API_BASE_PATH=/hrmslive-api \
NODE_ENV=production \
pnpm --filter @workspace/ems run build

rm -rf ~/public_html/hrmslive/*
cp -a artifacts/ems/dist/public/. ~/public_html/hrmslive/
```

Then click **Restart Application** in cPanel.

## ZKTeco connection

The cPanel account running the API needs Python 3 and the `pyzk` package
available to `python3`. In cPanel Terminal, install and verify it as the same
account that owns the Node.js app:

```bash
python3 -m pip install --user pyzk
python3 -c 'from zk import ZK; print("pyzk is ready")'
```

Use the public IPv4 address and port for each company's own machine. The API
server must be able to open a TCP connection to that address (usually port
`4370`). Private office-network addresses such as `192.168.x.x` cannot be
reached by a hosted server unless a VPN or secure network route is configured.
Restrict any router/firewall port forwarding to trusted sources where possible.

The **Test Connection** action performs a lightweight device probe without
downloading attendance or disabling the machine. Attendance sync attempts to
re-enable the device even when a pull fails.