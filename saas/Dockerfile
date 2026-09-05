# ─────────────────────────────────────────────────────────────────────────────
# KEYONE SaaS — Multi-stage Docker build
#
# Stage 1: deps     — install all npm dependencies
# Stage 2: builder  — generate Prisma client + Next.js standalone build
# Stage 3: runner   — minimal production image (~200MB vs ~1.5GB naive)
#
# Runtime mounts (docker-compose.production.yml):
#   /data     ← host /keyone/data   (uploads; legacy SQLite saas.db if pinned)
#   /logs     ← host /keyone/logs
#
# Environment: POSTGRES_URL and POSTGRES_DIRECT_URL must be set in the env file.
# package.json pins the Prisma schema to prisma/schema.postgres.prisma, so the
# `npx prisma generate` step below resolves those two vars — not DATABASE_URL,
# which is a legacy SQLite-era override (see saas/lib/db.ts).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# Install all deps (including dev) — needed for prisma generate + next build
RUN npm ci --ignore-scripts

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client for linux-debian target (matches runner image OS)
RUN npx prisma generate

# Inject git short hash as build ID (CI passes this via --build-arg)
ARG BUILD_ID=docker-unknown
ENV NEXT_PUBLIC_BUILD_ID=$BUILD_ID
ENV BUILD_ID=$BUILD_ID

# Build Next.js — output: standalone produces .next/standalone/
# SENTRY_AUTH_TOKEN is optional; build succeeds without source map upload
ARG SENTRY_AUTH_TOKEN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: Minimal production runner ───────────────────────────────────────
FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user for security
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone output: server.js + minimal node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma SQLite runtime: query engine + generated client
# These are NOT included in .next/standalone/node_modules by default
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Prisma schema (needed for $queryRaw and reflection APIs)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Volume mount points — owned by nextjs user
RUN mkdir -p /data /logs && chown nextjs:nodejs /data /logs

USER nextjs

EXPOSE 3000

# Liveness probe — matches /api/health contract (always HTTP 200)
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health | grep -q '"status"' || exit 1

CMD ["node", "server.js"]
