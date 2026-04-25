# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build NestJS
RUN npm run build

# Stage 2: Production
FROM node:20-slim AS production

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev

# Install the prisma CLI in the production image so `prisma migrate deploy`
# is available as part of the release step (see fly.toml `release_command`).
# Pinned to match devDependencies; keep these in sync.
RUN npm install --no-save prisma@5.22.0

# Generate Prisma client in production image
RUN npx prisma generate

# Copy built app from builder
COPY --from=builder /app/dist ./dist

# Copy data files for cost of living service
COPY --from=builder /app/data ./data

# Copy release script for smart Prisma migrate / db-push fallback
COPY --from=builder /app/scripts ./scripts

# Expose port
EXPOSE 3000

# Start the server. tsconfig has rootDir=./ so build emits dist/src/main.js
# (not dist/main.js). Pin the path explicitly.
CMD ["node", "dist/src/main"]
