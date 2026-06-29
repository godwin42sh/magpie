# syntax=docker/dockerfile:1

###############################################################################
# Backend image — NestJS 11 (ESM) + Playwright, on Node 26.
#
# Based on the official Playwright image (ships a matching Chromium plus every
# OS-level dependency the browser needs). The image's bundled Node is replaced
# with Node 26 (via NodeSource) so the container runs the same major as local
# dev (engines: node >=26). The Playwright tag is pinned to playwright@1.61.1
# from backend/package.json so the bundled browser and the npm package never
# drift.
#
# Multi-stage:
#   base     — Playwright image + Node 26 + Corepack
#   build    — install the workspace, build @magpie/shared then the backend,
#              then `pnpm deploy` a self-contained production bundle.
#   runtime  — copy only that bundle; no source, no dev deps, no build tools.
###############################################################################

# ---- base: Playwright image + Node 26 ---------------------------------------
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS base

# Replace the image's bundled Node with Node 26 (NodeSource), keeping the
# preinstalled Chromium and all of its OS dependencies. Then enable Corepack so
# the pnpm version pinned in package.json#packageManager is used.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_26.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g corepack --force \
 && corepack enable \
 && node --version

# ---- build stage ------------------------------------------------------------
FROM base AS build

WORKDIR /repo

# Copy the workspace manifests first so dependency installation is cached and
# only re-runs when a package.json / lockfile actually changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Install every workspace dependency from the frozen lockfile.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Bring in the actual sources and build shared first, then the backend.
COPY packages/shared packages/shared
COPY backend backend
RUN pnpm --filter @magpie/shared build \
 && pnpm --filter @magpie/backend build

# Produce a self-contained deployable directory for the backend in /app:
# it inlines @magpie/shared and installs ONLY production dependencies, with a
# real node_modules tree (no workspace symlinks) so it runs anywhere.
RUN pnpm --filter @magpie/backend deploy --prod /app

# ---- runtime stage ----------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /app

# The deployed bundle carries dist/, node_modules/ (prod only) and package.json.
COPY --from=build /app ./

# Runtime configuration (overridable via docker-compose env_file / -e):
#   CONFIG_PATH        — user-intent config.json (mounted volume)
#   STATE_PATH         — per-site machine snapshots (mounted volume)
#   FLARESOLVERR_URL   — Cloudflare-challenge solver endpoint
#   CAMOUFOX_URL       — anti-detect Firefox sidecar endpoint
#   NOTIFY_WEBHOOK_URL — Discord/Slack incoming webhook for change alerts
ENV PORT=3000 \
    CONFIG_PATH=/app/data/config.json \
    STATE_PATH=/app/data/state \
    FLARESOLVERR_URL= \
    CAMOUFOX_URL= \
    NOTIFY_WEBHOOK_URL=

EXPOSE 3000

CMD ["node", "dist/main.js"]
