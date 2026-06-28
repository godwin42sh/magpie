// Centralized e2e configuration. Two run modes, selected by E2E_TARGET:
//
//   local  (default) — Playwright starts the harness + backend (node dist) +
//                      frontend Vite dev server itself. Everything is on the
//                      host, so the backend reaches the harness at localhost.
//
//   docker           — The full `docker compose up --build` stack is already
//                      running. The app is the nginx frontend on :8080. The
//                      harness still runs on the host; the backend container
//                      reaches it via host.docker.internal. NOTIFY_WEBHOOK_URL
//                      must have been set in .env BEFORE compose up so the
//                      backend posts change notifications to our harness.
//
// Every value is overridable by an env var so CI can pin them explicitly.

export type Target = 'local' | 'docker';

export const TARGET: Target = (process.env.E2E_TARGET as Target) || 'local';

/** Port the harness server listens on (host). */
export const HARNESS_PORT = Number(process.env.HARNESS_PORT ?? 8390);

/** Base URL of the running app the browser drives. */
export const APP_URL =
  process.env.APP_URL ?? (TARGET === 'docker' ? 'http://localhost:8080' : 'http://localhost:5173');

/**
 * Hostname the BACKEND uses to reach the host-run harness.
 * - local : backend is a host process → localhost.
 * - docker: backend is a container → host.docker.internal.
 */
export const BACKEND_TO_HOST =
  process.env.BACKEND_TO_HOST ?? (TARGET === 'docker' ? 'host.docker.internal' : 'localhost');

/** Harness base URL as seen from the host (Playwright runner). */
export const HARNESS_HOST_URL = `http://localhost:${HARNESS_PORT}`;

/** Fixture page URL the backend will render (must be reachable from backend). */
export const FIXTURE_URL = `http://${BACKEND_TO_HOST}:${HARNESS_PORT}/fixture`;

/** Webhook URL the backend should POST change notifications to. */
export const WEBHOOK_URL = `http://${BACKEND_TO_HOST}:${HARNESS_PORT}/webhook`;
