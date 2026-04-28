# syntax=docker/dockerfile:1.6
#
# Multi-stage build for the TGP Finance backend.
#
# Prisma + npm note: package.json declares `postinstall: prisma generate`. In
# the production stage we install with `--omit=dev`, which would skip the
# `prisma` CLI (it lives in devDependencies) and break `postinstall` with
# `sh: 1: prisma: not found`. Both stages therefore use `--ignore-scripts` and
# we run `prisma generate` explicitly after the CLI is guaranteed to be on
# disk. This is the upstream-recommended pattern for Prisma in Docker.

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# OpenSSL is required by the Prisma engines on Debian slim.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy manifests + Prisma schema first so the layer caches across source edits.
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install ALL deps (including devDependencies) without running lifecycle
# scripts; we drive `prisma generate` explicitly below.
RUN npm ci --ignore-scripts

# Generate the Prisma client against the schema we just copied.
RUN npx --no-install prisma generate

# Bring in the rest of the source tree and build the Nest dist/.
COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:20-slim AS production

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy manifests + Prisma schema. The schema is needed at install time so
# `prisma generate` has something to read.
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install production deps only, skipping the postinstall hook (which would
# call the `prisma` CLI before it exists in this layer). We then add the
# Prisma CLI as a pinned, no-save dep so `prisma generate` and the
# release-time `prisma migrate deploy` (see fly.toml release_command +
# scripts/release.sh) are both available without bloating dependencies.
RUN npm ci --omit=dev --ignore-scripts \
 && npm install --no-save --ignore-scripts prisma@5.22.0 \
 && npx --no-install prisma generate \
 && npm cache clean --force

# Copy compiled app, runtime data files, and the release script.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# tsconfig has rootDir=./, so the entrypoint is dist/src/main.js (not
# dist/main.js). Pin the path explicitly.
CMD ["node", "dist/src/main"]
