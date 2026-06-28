// Thin client for the harness control endpoints, used from the test (host side,
// so it talks to the harness over localhost).

import { HARNESS_HOST_URL } from './env.js';

export type ReceivedWebhook = { receivedAt: string; body: unknown };

/** Set the fixture page's monitored-zone content. */
export async function setFixtureContent(content: string): Promise<void> {
  const res = await fetch(`${HARNESS_HOST_URL}/control/fixture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`setFixtureContent failed: ${res.status}`);
}

/** Reset received webhooks and fixture content to defaults. */
export async function resetHarness(): Promise<void> {
  const res = await fetch(`${HARNESS_HOST_URL}/control/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`resetHarness failed: ${res.status}`);
}

/** All webhook payloads the harness has received so far. */
export async function getWebhooks(): Promise<ReceivedWebhook[]> {
  const res = await fetch(`${HARNESS_HOST_URL}/control/webhooks`);
  if (!res.ok) throw new Error(`getWebhooks failed: ${res.status}`);
  const data = (await res.json()) as { webhooks: ReceivedWebhook[] };
  return data.webhooks;
}
