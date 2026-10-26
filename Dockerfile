FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build \
  && pnpm --filter @workspace/ems run build

FROM node:22-bookworm-slim AS api

WORKDIR /app
RUN corepack enable \
  && corepack prepare pnpm@10.26.1 --activate \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/pyzk \
  && /opt/pyzk/bin/pip install --no-cache-dir pyzk

ENV NODE_ENV=production \
    PORT=8080 \
    PATH="/opt/pyzk/bin:${PATH}"

COPY --from=build /app /app
WORKDIR /app/artifacts/api-server
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

FROM nginx:1.27-alpine AS web

COPY --from=build /app/artifacts/ems/dist/public/ /usr/share/nginx/html/
COPY docker/ems-nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
