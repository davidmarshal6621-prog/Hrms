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

The `source/` folder is a pnpm workspace. On cPanel Terminal:

```bash
cd ~/hrms-deploy
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

## 4. Create the cPanel Node.js App

In **Setup Node.js App**, use:

```text
Node version:       20.x or newer
Application root:   /home/CPANEL_USER/hrms-deploy
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
cd ~/hrms-deploy
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build

BASE_PATH=/hrmslive/ \
VITE_API_BASE_PATH=/hrmslive-api \
NODE_ENV=production \
pnpm --filter @workspace/ems run build

rm -rf ~/public_html/hrmslive/*
cp -a artifacts/ems/dist/public/. ~/public_html/hrmslive/
```

Then click **Restart Application** in cPanel.

## ZKTeco requirement

The cPanel server must be able to make an outbound TCP connection to:

```text
139.135.57.165:4370
```

Ask the hosting provider to allow this connection if device sync fails.