# Magpie — end-to-end tests

Playwright tests that exercise the **whole product** through the real UI and
API, with **no calls to any third-party site**. A tiny local _harness_ server
provides everything external:

- a **mutable fixture page** at `/fixture` (its `#zone` content is what the test
  changes to trigger a real change-detection event), and
- a **mock webhook receiver** at `/webhook` that records every notification the
  backend posts, plus `/control/*` endpoints the test uses to set fixture
  content and read received webhooks.

The single spec (`tests/monitor-flow.spec.ts`) drives the full flow:

1. Open the app, click **Add site**, paste the fixture URL, render it.
2. **Pick a zone** by clicking `#zone` inside the picker iframe.
3. Choose a recurrence **preset** and **create** the site.
4. See it in the list.
5. Establish a baseline with one **Check now** (first check ⇒ no notification).
6. **Mutate** the fixture content, **Check now** again ⇒ assert a change event
   is recorded _and_ the mock webhook received a notification mentioning the
   site.

## Opt-in real-site test (`tests/real-site-darty.spec.ts`)

A second, **opt-in** spec monitors a real Darty product page and the user-selected
`.buybox.js-buybox` ("Bientôt de retour en stock") zone. It is **skipped by
default** and only runs when `E2E_REAL_SITES=1`, because real third-party pages
are non-deterministic. It drives the backend pipeline at the API level
(create site → `check-now` → inspect) rather than scripting the picker against
live HTML.

It asserts a behavioral contract: monitoring the URL must **either** retrieve
the zone (stable hash across back-to-back checks) **or** fail with a truthful,
actionable reason — never a misleading "selector matched no element".

> **Observed (2026):** `darty.com` is protected by **Akamai Bot Manager** (it
> 403s headless Chromium with an empty body and bounces it to a WAF/queue page;
> FlareSolverr only solves Cloudflare, so it can't help either). With the
> **Camoufox** sidecar running (it is part of `docker compose`), the backend
> escalates to it and **retrieves the zone**, so this test passes via the
> success branch. Without Camoufox (e.g. `CAMOUFOX_URL` unset), it passes via
> the honest-block branch instead.

```bash
# prefer docker mode so FlareSolverr is available
cd e2e
E2E_TARGET=docker E2E_REAL_SITES=1 npm test
```

## Install (one time)

This package is intentionally **standalone** (not a pnpm workspace member) so it
never perturbs the app lockfile or the Docker builds.

```bash
cd e2e
npm install
npm run install:browsers   # downloads Chromium for the Playwright runner
```

## Run against the local dev stack (default)

Playwright starts everything itself — the harness, the backend (from its built
`dist/`), and the frontend Vite dev server (whose `/api` proxy targets the
backend). Build the workspace once so `backend/dist` exists:

```bash
# from the repo root
pnpm install
pnpm build

# then
cd e2e
npm test
```

The backend is pointed at the harness for notifications and writes its
config/state under `e2e/.tmp/` so your real `./data` is never touched, and every
run starts clean.

## Run against the docker compose stack

Bring the stack up first, with the notification webhook pointed at the
host-run harness (the backend container reaches the host via
`host.docker.internal`). The default harness port is **8390**.

```bash
# from the repo root — set the webhook BEFORE starting the stack
cp .env.example .env
# edit .env:  NOTIFY_WEBHOOK_URL=http://host.docker.internal:8390/webhook
docker compose up --build -d

# then run the e2e suite in docker mode (it starts the harness itself)
cd e2e
E2E_TARGET=docker npm test
```

In docker mode the test drives the nginx-served app on `http://localhost:8080`
and only the harness is managed by Playwright; the app stack is external.

## Configuration

All overridable via env vars (`support/env.ts`):

| Var               | Default (local / docker)                          | Meaning                                                  |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `E2E_TARGET`      | `local`                                           | `local` (Playwright boots the app) or `docker`           |
| `APP_URL`         | `http://localhost:5173` / `http://localhost:8080` | App the browser drives                                   |
| `HARNESS_PORT`    | `8390`                                            | Host port for the fixture + webhook harness              |
| `BACKEND_TO_HOST` | `localhost` / `host.docker.internal`              | Hostname the **backend** uses to reach the harness       |
| `E2E_REAL_SITES`  | _(unset)_                                         | Set to `1` to also run the opt-in real-site (Darty) test |

## Artifacts

- HTML report: `npm run report` (after a run).
- Traces on first retry, screenshots on failure (under `test-results/`).
