import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { type Site } from '@magpie/shared';

import { ConfigStore } from '../config/config-store.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { detectAntiBot, looksJsRendered } from '../rendering/cloudflare-detection.js';
import { FetchService } from '../rendering/fetch.service.js';
import { SnapshotStore } from '../snapshots/snapshot-store.service.js';
import { normalizeHtml, normalizeText } from './normalize.js';
import { computeFingerprint, resolveZone } from './selector.js';

/** Outcome of a single crawl run, returned to callers (e.g. check-now). */
export interface CrawlRunResult {
  siteId: string;
  /** 'changed' | 'unchanged' | 'error' | 'skipped' (overlapping run). */
  status: 'changed' | 'unchanged' | 'error' | 'skipped';
  hash?: string;
  /** True when the zone was located via a fallback (selector drifted). */
  drifted?: boolean;
  message?: string;
}

/**
 * The crawl pipeline. For a given site it:
 *   fetch (escalating) → resolve zone (selector → xpath → fingerprint) →
 *   extract by compareMode → normalize → SHA-256 → diff vs last hash →
 *   on change: save snapshot + record + notify; else record a checked tick.
 *
 * A per-site in-memory "running" guard makes overlapping ticks no-ops so a slow
 * crawl never stacks up behind its own schedule.
 */
@Injectable()
export class CrawlService {
  private readonly logger = new Logger(CrawlService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly config: ConfigStore,
    private readonly fetcher: FetchService,
    private readonly snapshots: SnapshotStore,
    private readonly notifications: NotificationService,
  ) {}

  /** Runs the pipeline for `siteId`. Resolves even on failure (records error). */
  async run(siteId: string): Promise<CrawlRunResult> {
    if (this.running.has(siteId)) {
      this.logger.debug(`Skipping overlapping crawl for ${siteId}`);
      return { siteId, status: 'skipped' };
    }
    this.running.add(siteId);
    try {
      return await this.runInner(siteId);
    } finally {
      this.running.delete(siteId);
    }
  }

  private async runInner(siteId: string): Promise<CrawlRunResult> {
    let site: Site;
    try {
      site = await this.config.get(siteId);
    } catch (err) {
      this.logger.warn(`Crawl requested for unknown site ${siteId}`);
      throw err;
    }

    try {
      const { html, status } = await this.fetcher.fetch(site.url);

      // Never treat an error response (down site, 5xx maintenance page, etc.)
      // as content: skip change detection entirely so a transient outage can't
      // masquerade as a change. status 0 = unknown (couldn't be determined) —
      // fall through and let selector/anti-bot handling decide.
      if (status !== 0 && (status < 200 || status >= 300)) {
        const message = `Site returned HTTP ${status}; skipping change detection.`;
        this.logger.warn(`[${site.name}] ${message}`);
        await this.snapshots.recordError(siteId, message);
        return { siteId, status: 'error', message };
      }

      const $ = cheerio.load(html);

      const resolution = resolveZone($, {
        selector: site.selector,
        fallbackXPath: site.selectorFallbackXPath,
        fingerprint: site.fingerprint,
      });

      if (!resolution.element) {
        // Diagnose WHY nothing matched: a recognizable anti-bot wall or an
        // empty/unrendered shell is a very different (and more actionable)
        // failure than a genuinely stale selector. Reporting "selector matched
        // no element" for a DataDome block would be misleading.
        const provider = detectAntiBot(html);
        const message = provider
          ? `Page appears blocked by ${provider} anti-bot protection; the monitored zone could not be retrieved. ` +
            `FlareSolverr only bypasses Cloudflare, not ${provider}.`
          : looksJsRendered(html)
            ? `Fetched page was empty or not fully rendered; selector "${site.selector}" matched no element ` +
              `(the site may use bot protection or require JavaScript/login).`
            : `Selector "${site.selector}" matched no element (no fallback hit)`;
        this.logger.warn(`[${site.name}] ${message}`);
        await this.snapshots.recordError(siteId, message);
        return { siteId, status: 'error', message };
      }

      if (resolution.drifted) {
        this.logger.warn(
          `[${site.name}] selector drifted — located zone via ${resolution.matchedBy} fallback`,
        );
      }

      // Extract the zone by compareMode.
      const raw =
        site.compareMode === 'textContent'
          ? resolution.element.text()
          : (resolution.element.html() ?? '');

      const normalized =
        site.compareMode === 'textContent' ? normalizeText(raw) : normalizeHtml(raw);

      const hash = sha256(normalized);
      const fingerprint = computeFingerprint(resolution.element);

      const state = await this.snapshots.get(siteId);
      const previousHash = state.lastHash;

      // First-ever check (no baseline): record the baseline, don't notify.
      if (previousHash === null) {
        await this.snapshots.recordChecked(siteId, { hash, snapshot: normalized, fingerprint });
        this.logger.log(`[${site.name}] baseline captured (${hash.slice(0, 12)})`);
        return { siteId, status: 'unchanged', hash, drifted: resolution.drifted };
      }

      if (previousHash === hash) {
        await this.snapshots.recordChecked(siteId, { hash, snapshot: normalized, fingerprint });
        return { siteId, status: 'unchanged', hash, drifted: resolution.drifted };
      }

      // Change detected.
      const diff = buildDiff(state.lastSnapshot, normalized);
      // Human-readable preview of the new zone content (visible text), used in
      // the notification and stored on the event for the history view.
      const preview = makePreview(resolution.element.text());
      await this.snapshots.recordChange(siteId, {
        oldHash: previousHash,
        newHash: hash,
        snapshot: normalized,
        fingerprint,
        preview,
        ...(diff !== undefined ? { diff } : {}),
      });
      this.logger.log(`[${site.name}] CHANGE ${previousHash.slice(0, 12)} -> ${hash.slice(0, 12)}`);

      // Notify — never let a notification failure break the crawl.
      await this.notifications
        .notifyChange({ name: site.name, url: site.url }, { preview })
        .catch((err: unknown) => {
          this.logger.error(`Notification error for ${site.name}: ${String(err)}`);
          return false;
        });

      return { siteId, status: 'changed', hash, drifted: resolution.drifted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${site.name}] crawl failed: ${message}`);
      await this.snapshots.recordError(siteId, message);
      return { siteId, status: 'error', message };
    }
  }
}

/** Hex SHA-256 of a UTF-8 string. */
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** A compact, human-readable preview of the zone's visible text. */
function makePreview(text: string, max = 500): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return '(no visible text in the monitored zone)';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Builds a compact, line-oriented diff summary between two snapshots. Kept
 * intentionally simple (no external diff lib): reports the count of changed
 * lines and a short preview, which is plenty for a webhook message and the
 * history view.
 */
function buildDiff(oldSnapshot: string | null, newSnapshot: string): string | undefined {
  if (oldSnapshot === null) {
    return undefined;
  }
  const oldLines = oldSnapshot.split(/\r?\n/);
  const newLines = newSnapshot.split(/\r?\n/);
  const max = Math.max(oldLines.length, newLines.length);
  const changes: string[] = [];
  for (let i = 0; i < max; i += 1) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o !== n) {
      if (o !== undefined) changes.push(`- ${o}`);
      if (n !== undefined) changes.push(`+ ${n}`);
    }
    if (changes.length >= 40) {
      changes.push('… (truncated)');
      break;
    }
  }
  return changes.length > 0 ? changes.join('\n') : undefined;
}
