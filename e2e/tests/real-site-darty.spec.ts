import { expect, test } from '@playwright/test';

// Real-site monitoring test for a specific Darty product page + zone.
//
// Unlike monitor-flow.spec.ts (which is fully self-contained against the local
// fixture), this hits a real, third-party, bot-protected page, so it is:
//
//   * OPT-IN — skipped unless E2E_REAL_SITES=1, because real sites are
//     non-deterministic (markup/stock changes, geo-blocks, anti-bot walls) and
//     must never break the default/CI run.
//   * Best run against the docker stack (E2E_TARGET=docker), where the backend
//     has FlareSolverr wired up (FLARESOLVERR_URL=http://flaresolverr:8191).
//     Darty is protected by DataDome (not Cloudflare), which FlareSolverr does
//     not solve — see the contract in the test body.
//
// It drives the backend pipeline at the API level (create site → check-now →
// inspect state) rather than scripting the picker against live Darty HTML — the
// picker is already covered by the fixture flow, and an API-level test of the
// real fetch → resolve → normalize → hash → snapshot path is what actually
// matters for "monitor THIS zone on THIS url".

const RUN_REAL = process.env.E2E_REAL_SITES === '1';

const DARTY_URL =
  'https://www.darty.com/nav/achat/gros_electromenager/chauffage_climatisation/climatiseur/midea_mmcs-12hrn8-qrd0.html';

// The zone the user selected:
//   <div class="buybox js-buybox"> … "Bientôt de retour en stock" … </div>
// `.buybox.js-buybox` is a stable, non-hashed class selector for that block —
// exactly what the picker would settle on (no usable id, classes not hashed).
const ZONE_SELECTOR = '.buybox.js-buybox';

type CheckNowResult = {
  siteId: string;
  status: 'changed' | 'unchanged' | 'error' | 'skipped';
  hash?: string;
  drifted?: boolean;
  message?: string;
};

test.describe('real site — Darty Midea climatiseur stock watch', () => {
  test.skip(
    !RUN_REAL,
    'Opt-in: set E2E_REAL_SITES=1 (and prefer E2E_TARGET=docker for FlareSolverr).',
  );
  test.describe.configure({ mode: 'serial' });

  // Real fetch + a Cloudflare solve via FlareSolverr can be slow.
  test.setTimeout(180_000);

  let siteId: string | undefined;

  test('monitors the buybox availability zone end to end', async ({ request }) => {
    // --- Create the site directly via the API ------------------------------
    // compareMode 'textContent' is the right choice for a stock watcher: it
    // tracks the human-readable availability text ("Bientôt de retour en stock"
    // → in-stock) while ignoring volatile inline SVG/markup churn.
    const createRes = await request.post('/api/sites', {
      data: {
        name: 'Darty Midea MMCS-12HRN8 — stock watch',
        url: DARTY_URL,
        selector: ZONE_SELECTOR,
        compareMode: 'textContent',
        cron: '0 * * * *', // every hour
        enabled: true,
      },
    });
    expect(
      createRes.ok(),
      `create failed: ${createRes.status()} ${await createRes.text()}`,
    ).toBeTruthy();
    const site = (await createRes.json()) as { id: string; selector: string };
    siteId = site.id;
    expect(site.selector).toBe(ZONE_SELECTOR);

    // --- First crawl: baseline ---------------------------------------------
    const baseline = await request.post(`/api/sites/${siteId}/check-now`);
    expect(baseline.ok()).toBeTruthy();
    const result = (await baseline.json()) as CheckNowResult;

    // Behavioral contract for monitoring a REAL, possibly bot-protected URL:
    // the system must EITHER retrieve the zone, OR fail with a truthful,
    // actionable reason — never a misleading one.
    //
    // NOTE (observed 2026): darty.com is protected by **DataDome**, not
    // Cloudflare. FlareSolverr only solves Cloudflare, so from a datacenter IP
    // the .buybox zone is not retrievable and the crawl reports a clear
    // DataDome block. If you run this from a residential IP / a real browser
    // session / a DataDome-capable fetcher, the success branch below should
    // light up instead. Both outcomes are correct; a confusing
    // "selector matched no element" is NOT.
    if (result.status === 'error') {
      // The error must name the real cause (anti-bot / blocked / not rendered),
      // proving the pipeline degrades honestly rather than misreporting.
      expect(result.message ?? '').toMatch(
        /anti-bot|blocked|DataDome|empty|not (?:fully )?rendered/i,
      );
      // eslint-disable-next-line no-console
      console.warn(`[darty] zone not retrievable from this environment: ${result.message}`);
      return;
    }

    // --- Success branch: the zone was actually retrieved -------------------
    // The selector must resolve to the zone (not fall back / drift).
    expect(result.drifted ?? false, 'selector drifted — Darty markup may have changed').toBe(false);
    // First check establishes the baseline snapshot and a content hash.
    expect(['changed', 'unchanged']).toContain(result.status);
    expect(result.hash, 'baseline produced a content hash').toBeTruthy();

    // Re-check: without an underlying page change, an immediate second crawl
    // must report 'unchanged' (proves normalization is stable for this real
    // zone, not just for the local fixture).
    const recheck = await request.post(`/api/sites/${siteId}/check-now`);
    expect(recheck.ok()).toBeTruthy();
    const recheckResult = (await recheck.json()) as CheckNowResult;
    expect(recheckResult.status, `unexpected status: ${recheckResult.message ?? ''}`).toBe(
      'unchanged',
    );
    expect(recheckResult.hash).toBe(result.hash);

    // The change history is queryable (baseline alone records no change event).
    const events = await request.get(`/api/sites/${siteId}/events`);
    expect(events.ok()).toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    // Keep the repo's config.json clean — remove the site we created.
    // (afterEach is test-scoped, so the `request` fixture is available here;
    // afterAll is worker-scoped and could not use it.)
    if (siteId) {
      await request.delete(`/api/sites/${siteId}`);
      siteId = undefined;
    }
  });
});
