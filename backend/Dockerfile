# syntax=docker/dockerfile:1

###############################################################################
# Backend image — NestJS 11 (ESM) + Playwright.
#
# Built on the official Playwright image, which already ships a matching
# Chromium build plus every OS-level dependency the browser needs. The image
# tag is pinned to the same Playwright version declared in backend/package.json
# (playwright@1.61.1) so the bundled browser and the npm package never drift.
#
# Multi-stage:
#   build    — install the whole pnpm workspace, build @magpie/shared then the
#              backend, then `pnpm deploy` a self-contained production bundle.
#   runtime  — copy only that bundle; no source, no dev deps, no build tools.
###############################################################################

# ---- build stage ------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS build

# Enable Corepack so the pnpm version pinned in package.json#packageManager is
# used (keeps lockfile resolution identical to local development).
RUN corepack enable

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
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS runtime

ENV NODE_ENV=production
WORKDIR /app

# The deployed bundle carries dist/, node_modules/ (prod only) and package.json.
COPY --from=build /app ./

# Runtime configuration (overridable via docker-compose env_file / -e):
#   CONFIG_PATH        — user-intent config.json (mounted volume)
#   STATE_PATH         — per-site machine snapshots (mounted volume)
#   FLARESOLVERR_URL   — Cloudflare-challenge solver endpoint
#   NOTIFY_WEBHOOK_URL — Discord/Slack incoming webhook for change alerts
ENV PORT=3000 \
    CONFIG_PATH=/app/data/config.json \
    STATE_PATH=/app/data/state \
    FLARESOLVERR_URL= \
    NOTIFY_WEBHOOK_URL=

EXPOSE 3000

CMD ["node", "dist/main.js"]
