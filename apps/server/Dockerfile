# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.4.4
ARG POSTGRES_MAJOR=18

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    bun run --cwd packages/db db:generate \
 && bun run --cwd apps/server build

RUN mkdir -p /prod \
 && cp bun.lock bunfig.toml /prod/ \
 && bun -e 'const manifest = await Bun.file("package.json").json(); delete manifest.scripts; await Bun.write("/prod/package.json", JSON.stringify(manifest, null, "\t"));' \
 && for dir in apps/* packages/*; do mkdir -p "/prod/$dir" && cp "$dir/package.json" "/prod/$dir/"; done
WORKDIR /prod
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --omit=peer --frozen-lockfile \
      --filter server --filter @marinho-gestao/db

FROM oven/bun:${BUN_VERSION}-slim AS runtime
ARG POSTGRES_MAJOR
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSLo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && . /etc/os-release \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-client-${POSTGRES_MAJOR}" \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /prod/node_modules ./node_modules
COPY --from=build /prod/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /prod/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /app/apps/server/package.json /app/apps/server/.env.schema ./apps/server/
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/packages/db/package.json /app/packages/db/.env.schema /app/packages/db/prisma.config.ts ./packages/db/
COPY --from=build /app/packages/db/prisma/schema ./packages/db/prisma/schema
COPY --from=build /app/packages/db/prisma/migrations ./packages/db/prisma/migrations

ARG GIT_SHA=dev
ENV NODE_ENV=production \
    GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.source="https://github.com/Lucas-m12/marinho-locacoes-gestao" \
      org.opencontainers.image.revision="${GIT_SHA}"

USER bun
WORKDIR /app/apps/server
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "dist/index.mjs"]
