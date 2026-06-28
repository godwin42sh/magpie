import { expect, test } from '@playwright/test';

import { FIXTURE_URL } from '../support/env.js';
import { getWebhooks, resetHarness, setFixtureContent } from '../support/harness-client.js';

// End-to-end happy path, fully self-contained (no real third-party sites):
//
//   1. Reset the harness; the fixture page starts with known content.
//   2. Drive the Add-site wizard: paste the fixture URL → render → pick the
//      #zone element in the picker iframe → choose a preset → create.
//   3. The new site shows in the list.
//   4. Establish a baseline with one "Check now" (first check = no change).
//   5. Mutate the fixture page content.
//   6. "Check now" again → a change is detected: a change event is recorded
//      AND the mock webhook receives a notification.
//
// Runs against either the local dev stack (default) or the docker compose stack
// (E2E_TARGET=docker). See e2e/README.md.

test.describe.configure({ mode: 'serial' });

// Track the site this test creates so it is removed afterwards. In docker mode
// the backend persists to the real ./data volume, so without cleanup repeated
// runs accumulate duplicate sites and cross-contaminate state (a stale
// same-named site would be picked up by the find-by-name below). A unique name
// per run + afterEach deletion keep the suite idempotent.
let createdSiteId: string | undefined;

test.afterEach(async ({ request }) => {
  if (createdSiteId) {
    await request.delete(`/api/sites/${createdSiteId}`);
    createdSiteId = undefined;
  }
});

test('add a site, detect a change, and fire a notification', async ({ page, request }) => {
  await resetHarness();
  await setFixtureContent('initial content v1');

  // --- Step 1: URL --------------------------------------------------------
  await page.goto('/');
  await page.getByRole('link', { name: '+ Add site' }).click();
  await expect(page.getByRole('heading', { name: 'Add a site' })).toBeVisible();

  await page.getByLabel('Page URL').fill(FIXTURE_URL);
  await page.getByRole('button', { name: 'Load page' }).click();

  // --- Step 2: pick the zone inside the sandboxed iframe ------------------
  // The backend proxy-renders the fixture; the picker iframe shows it. The
  // injected inspector posts the selection on a real click.
  const frame = page.frameLocator('iframe.picker-frame');
  const zone = frame.locator('#zone');
  await expect(zone).toBeVisible();
  await zone.click();

  // The parent reflects the picked selector in the toolbar and advances.
  await expect(page.getByText('Selected', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Selected zone' })).toBeVisible();
  // Selector resolves to the stable id.
  await expect(page.locator('.selection-summary code').first()).toHaveText('#zone');

  // --- Step 3: name + schedule preset + create ----------------------------
  // Unique per run so a stale site left in a persistent volume can't shadow it.
  const siteName = `E2E Fixture Site ${Date.now()}`;
  await page.getByLabel('Name').fill(siteName);

  // Pick a recurrence preset (the cron field is driven by the preset buttons).
  await page.getByRole('button', { name: 'Every 5 min' }).click();
  await expect(page.getByLabel('Cron expression')).toHaveValue('*/5 * * * *');

  await page.getByRole('button', { name: 'Create site' }).click();

  // --- Verify it landed in the list ---------------------------------------
  await expect(page).toHaveURL(/\/$/);
  const row = page.getByRole('row', { name: new RegExp(siteName) });
  await expect(row).toBeVisible();

  // Resolve the new site id via the API (more robust than scraping the DOM).
  const sitesRes = await request.get('/api/sites');
  expect(sitesRes.ok()).toBeTruthy();
  const sites = (await sitesRes.json()) as Array<{ id: string; name: string }>;
  const site = sites.find((s) => s.name === siteName);
  expect(site, 'created site present in API listing').toBeTruthy();
  const siteId = site!.id;
  createdSiteId = siteId; // ensure afterEach removes it

  // --- Step 4: baseline check (first check = unchanged, no notification) ---
  const baseline = await request.post(`/api/sites/${siteId}/check-now`);
  expect(baseline.ok()).toBeTruthy();
  const baselineResult = (await baseline.json()) as { status: string };
  expect(['unchanged', 'changed']).toContain(baselineResult.status);
  // First crawl captures the baseline snapshot and must NOT notify.
  expect(await getWebhooks()).toHaveLength(0);

  // --- Step 5: mutate the fixture -----------------------------------------
  await setFixtureContent('CHANGED content v2 — totally different');

  // --- Step 6: change check → event recorded + webhook fired --------------
  const changed = await request.post(`/api/sites/${siteId}/check-now`);
  expect(changed.ok()).toBeTruthy();
  const changedResult = (await changed.json()) as { status: string };
  expect(changedResult.status).toBe('changed');

  // A change event is recorded for the site.
  const eventsRes = await request.get(`/api/sites/${siteId}/events`);
  expect(eventsRes.ok()).toBeTruthy();
  const events = (await eventsRes.json()) as Array<{ id: string; siteId: string }>;
  expect(events.length).toBeGreaterThanOrEqual(1);
  expect(events[0]?.siteId).toBe(siteId);

  // The mock webhook received exactly one notification mentioning the site.
  await expect
    .poll(async () => (await getWebhooks()).length, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  const hooks = await getWebhooks();
  const payload = hooks[0]?.body as { content?: string } | undefined;
  expect(payload?.content ?? '').toContain(siteName);
});
