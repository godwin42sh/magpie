import { defineConfig, devices } from '@playwright/test';

import { APP_URL, HARNESS_PORT, TARGET, WEBHOOK_URL } from './support/env.js';

// In local mode Playwright boots the whole app itself: the harness server, the
// NestJS backend (from its built dist), and the frontend Vite dev server (whose
// /api proxy forwards to the backend). In docker mode it assumes the compose
// stack is already up and only the harness is started here.
//
// The backend is pointed at the harness for notifications (NOTIFY_WEBHOOK_URL)
// and writes its config/state under e2e/.tmp so each run starts clean and the
// repo's real ./data is never touched.
const localBackendEnv = {
  PORT: '3000',
  NOTIFY_WEBHOOK_URL: WEBHOOK_URL,
  CONFIG_PATH: new URL('./.tmp/config.json', import.meta.url).pathname,
  STATE_PATH: new URL('./.tmp/state', import.meta.url).pathname,
  // No FlareSolverr in e2e; the fixture is a plain page, plain HTTP/Playwright
  // suffices. Leaving FLARESOLVERR_URL unset disables that escalation branch.
};

const repoRoot = new URL('..', import.meta.url).pathname;

// The harness runs host-side in BOTH modes (the backend, container or not,
// renders its fixture and posts webhooks to it).
const harnessServer = {
  command: 'node support/harness-server.mjs',
  url: `http://localhost:${HARNESS_PORT}/healthz`,
  reuseExistingServer: !process.env.CI,
  env: { HARNESS_PORT: String(HARNESS_PORT) },
};

// In local mode we additionally boot the backend + frontend ourselves.
const localAppServers = [
  {
    // 2. Backend (NestJS) from its compiled output. Assumes `pnpm build` ran.
    command: 'node backend/dist/main.js',
    cwd: repoRoot,
    url: 'http://localhost:3000/api/sites',
    reuseExistingServer: !process.env.CI,
    env: localBackendEnv,
    timeout: 60_000,
  },
  {
    // 3. Frontend Vite dev server (its /api proxy → backend:3000).
    command: 'pnpm --filter @magpie/frontend dev --port 5173 --strictPort',
    cwd: repoRoot,
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Harness always; backend+frontend only in local mode (docker stack is
  // started externally with `docker compose up --build`).
  webServer: TARGET === 'local' ? [harnessServer, ...localAppServers] : [harnessServer],
});
