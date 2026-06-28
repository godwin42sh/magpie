# Magpie

A self-hosted webpage **change monitor**. Pick a zone on any page with a visual
picker, choose how often to check it (cron), and get notified on a Discord/Slack
webhook when that zone changes.

## How it works

- **Zone picking** — the backend renders the target page with Playwright,
  neutralizes its scripts, and serves sanitized same-origin HTML into an
  `<iframe srcdoc>`. An injected picker script does hover-highlight + click and
  `postMessage`s the chosen CSS selector + a fingerprint back to the parent.
- **Crawling** — fetches escalate from plain HTTP → Playwright → FlareSolverr
  (on a detected Cloudflare challenge) → **Camoufox** (anti-detect Firefox,
  tried as a last resort when the other tiers return an empty/blocked page —
  defeats Akamai/DataDome/Cloudflare bot protection that the others cannot).
- **Change detection** — each enabled site is scheduled with its cron
  expression; the picked zone is hashed and compared against the last snapshot.
- **Notifications** — on a change, `NotificationService` POSTs JSON to a
  configured Discord/Slack incoming webhook URL.
- **Persistence** — `config.json` holds **user intent** (atomic write + an
  in-process mutex). `state/<siteId>.json` holds **machine snapshots**, kept on
  a separate Docker volume.
- **Auth** — none.

## Repository layout

```
.
├── frontend/          React 19 + Vite 8 + TS, React Router, TanStack Query,
│                      react-hook-form + @hookform/resolvers/zod
├── backend/           NestJS 11 + @nestjs/schedule, port 3000, routes under /api
├── camoufox/          Anti-detect Firefox fetch sidecar (Python/FastAPI)
├── e2e/               Playwright end-to-end tests (standalone)
└── packages/
    └── shared/        @magpie/shared — Zod v4 schemas + inferred types
                       (the single source of truth for all data contracts)
```

`@magpie/shared` is consumed by both apps via `workspace:*`. All Zod schemas and
the types derived from them live there — there are **no** hand-written duplicate
types and **no** class-validator / class-transformer anywhere.

## Tooling

- **pnpm workspaces** + **Turborepo** (`turbo run build|lint|test|format`).
- **TypeScript strict** is centralized in `tsconfig.base.json`
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`). Every package extends it.
- **Prettier** is configured once at the root (`printWidth` 100, single quotes,
  trailing commas, semicolons).

## Architecture

Four containers wired on a single Docker network:

```
                ┌──────────────┐        :8080 (host)
  browser ────▶ │   frontend   │  nginx: serves the SPA, proxies /api ─┐
                │   (nginx)    │                                       │
                └──────────────┘                                       ▼
                                                            ┌──────────────────┐
                                                            │     backend      │
                          change notification (webhook)◀────│   (NestJS 11)    │
                                                            │  + Playwright    │
                                                            │  /app/data vol   │
                                                            └───┬───────────┬──┘
                                                  Cloudflare    │           │  empty/blocked
                                                  challenge     ▼           ▼  (Akamai/DataDome)
                                                   ┌──────────────────┐  ┌──────────────────┐
                                                   │  flaresolverr    │  │    camoufox      │
                                                   │      :8191       │  │  :8192 (Firefox) │
                                                   └──────────────────┘  └──────────────────┘
```

- **frontend** — Vite build served by nginx. nginx falls back to `index.html`
  for client-side routes and reverse-proxies `/api` → `backend:3000`, so the
  app code always calls a same-origin `/api` in both dev and prod.
- **backend** — NestJS API; Playwright (and its Chromium) live here for
  zone-render + crawling. Persists `config.json` (user intent) and
  `state/<siteId>.json` (machine snapshots) under `/app/data`, mounted from
  `./data`.
- **flaresolverr** — Cloudflare-challenge solver the backend escalates to.
- **camoufox** — anti-detect Firefox sidecar (HTTP API). Last-resort fetch tier
  for bot protection (Akamai/DataDome/Cloudflare) that headless Chromium and
  FlareSolverr cannot beat. Escalated to only when other tiers return an
  empty/blocked page. (Note: bypassing a site's anti-bot measures may conflict
  with its terms of service — use responsibly.)

## Prerequisites

- Node.js >= 20 and pnpm 9 (`corepack enable`) — for local development.
- Docker + Docker Compose v2 — for the containerized stack.

## Run the stack (Docker)

```bash
cp .env.example .env          # then edit NOTIFY_WEBHOOK_URL etc. as desired
docker compose up --build
```

Open the app at **http://localhost:8080**. State persists in `./data`.
Stop with `docker compose down` (add `-v` only if you also want to drop volumes;
`./data` is a bind mount, so remove it manually to reset).

The backend image is built on the official `mcr.microsoft.com/playwright`
image (pinned to the same Playwright version as `backend/package.json`), so a
matching Chromium and all its OS deps are already present.

## Local development (without Docker)

```bash
pnpm install
pnpm build                                   # builds @magpie/shared first

# Run each app in watch mode (separate terminals):
pnpm --filter @magpie/backend dev             # NestJS on :3000
pnpm --filter @magpie/frontend dev            # Vite on :5173 (proxies /api → :3000)
```

For full crawling/zone-picking locally you also need Playwright's browser and,
optionally, a FlareSolverr instance:

```bash
pnpm --filter @magpie/backend exec playwright install chromium
```

## Environment variables

Consumed by the **backend** (see `.env.example`):

| Var                         | Default                | Purpose                                                    |
| --------------------------- | ---------------------- | ---------------------------------------------------------- |
| `PORT`                      | `3000`                 | Backend listen port.                                       |
| `CONFIG_PATH`               | `./data/config.json`   | User-intent config (atomic write + in-process mutex).      |
| `STATE_PATH`                | `./data/state`         | Per-site machine snapshots directory.                      |
| `NOTIFY_WEBHOOK_URL`        | _(empty → notify off)_ | Discord/Slack incoming webhook for change alerts.          |
| `FLARESOLVERR_URL`          | _(unset → branch off)_ | FlareSolverr `/v1` endpoint for Cloudflare challenges.     |
| `FLARESOLVERR_TIMEOUT_MS`   | `60000`                | FlareSolverr request timeout.                              |
| `CAMOUFOX_URL`              | _(unset → branch off)_ | Camoufox sidecar `/fetch` endpoint (anti-bot last resort). |
| `CAMOUFOX_TIMEOUT_MS`       | `90000`                | Camoufox fetch timeout.                                    |
| `PLAYWRIGHT_CONCURRENCY`    | `2`                    | Max concurrent Playwright renders.                         |
| `PLAYWRIGHT_NAV_TIMEOUT_MS` | `30000`                | Playwright navigation timeout.                             |
| `PLAYWRIGHT_USER_AGENT`     | _(Chromium default)_   | Override the render user agent.                            |
| `HTTP_FETCH_TIMEOUT_MS`     | `15000`                | Plain-HTTP fetch timeout.                                  |
| `HTTP_USER_AGENT`           | _(default)_            | Plain-HTTP fetch user agent.                               |

Compose-only: `FRONTEND_PORT` (default `8080`) — host port the frontend is
published on.

## Tests

**Unit tests** (per package, via Turborepo):

```bash
pnpm test                              # all packages
pnpm --filter @magpie/backend test      # NestJS + Supertest (Jest)
pnpm --filter @magpie/frontend test     # React + selector engine (Vitest)
```

**End-to-end tests** (Playwright, in [`e2e/`](./e2e)) — a deterministic full
flow (add site → pick zone → detect a change → assert event + webhook) that
never hits a real site; a local harness provides a mutable fixture page and a
mock webhook receiver.

```bash
cd e2e
npm install && npm run install:browsers   # one time

# Against a locally built stack (Playwright boots backend+frontend itself):
pnpm build                                 # (from repo root) so backend/dist exists
npm test

# Against the docker compose stack:
#   set NOTIFY_WEBHOOK_URL=http://host.docker.internal:8390/webhook in .env first,
#   then `docker compose up --build -d`, then:
E2E_TARGET=docker npm test
```

See [`e2e/README.md`](./e2e/README.md) for the full matrix and configuration.
