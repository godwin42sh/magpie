# syntax=docker/dockerfile:1

###############################################################################
# Frontend image — React 19 + Vite 8 built to static assets, served by nginx.
#
# Multi-stage:
#   build    — install the pnpm workspace, build @magpie/shared then run the
#              Vite production build into frontend/dist.
#   runtime  — copy dist into a minimal nginx image; nginx serves the SPA and
#              reverse-proxies /api to the backend container.
###############################################################################

# ---- build stage ------------------------------------------------------------
FROM node:26-bookworm-slim AS build

# Node 26 no longer bundles Corepack, so install it before enabling pnpm.
RUN npm install -g corepack && corepack enable

WORKDIR /repo

# Manifests first for cached dependency installs.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Sources for the two packages the frontend build touches.
COPY packages/shared packages/shared
COPY frontend frontend

# @magpie/shared must be compiled to dist/ before Vite/tsc can resolve it.
RUN pnpm --filter @magpie/shared build \
 && pnpm --filter @magpie/frontend build

# ---- runtime stage ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# SPA + /api reverse-proxy config (proxies to the `backend` compose service).
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Static assets produced by `vite build`.
COPY --from=build /repo/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
