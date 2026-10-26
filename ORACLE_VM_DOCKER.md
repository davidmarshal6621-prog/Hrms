# Run EMS on an Ubuntu VM with Docker Compose

The Compose setup runs the EMS website, API, and PostgreSQL. Only the website port is published on the VM; the API and database stay on the private Docker network. Ollama is not used by EMS and does not need to be exposed.

## 1. Prepare configuration

From the repository root:

```bash
cp .env.example .env
openssl rand -hex 32
```

Put one generated value in `POSTGRES_PASSWORD` and generate a second value for `SESSION_SECRET` in `.env`. Keep `.env` private and do not commit it.

Check that Docker Compose is available:

```bash
docker compose version
```

## 2. Build and start the services

```bash
docker compose up -d --build
```

On the first run, initialize the database schema once:

```bash
docker compose exec api pnpm --dir /app --filter @workspace/db run push
```

The PostgreSQL data is stored in the `ems_postgres_data` Docker volume and survives container restarts.

## 3. Open the app

With the default `EMS_HTTP_PORT=3000`, visit:

```text
http://<VM_PUBLIC_IP>:3000
```

Add an Oracle Cloud **TCP ingress rule for port 3000**, restricted to your public IP while testing. If Ubuntu UFW is enabled, allow the same port there too. The API is served through the website's `/api` path, so do not open port 8080. Do not expose PostgreSQL port 5432 or Ollama port 11434.

## Useful commands

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose down
```

`docker compose down` keeps the database volume. Avoid `docker compose down -v` unless you intend to delete the stored database.

After pulling code changes, rebuild and restart:

```bash
docker compose up -d --build
```

If an update changes the database schema, run the schema push command again after the services are up.
