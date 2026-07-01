import { Injectable, Logger } from '@nestjs/common';

import { CamoufoxService } from './camoufox.service.js';
import {
  isCloudflareChallenge,
  looksJsRendered,
  looksLikeBlockPage,
} from './cloudflare-detection.js';
import { FlareSolverrService } from './flaresolverr.service.js';
import { PlaywrightService } from './playwright.service.js';

/** Final result of fetching a URL through the escalation pipeline. */
export interface FetchResult {
  html: string;
  finalUrl: string;
  /** HTTP status of the (final) response, or 0 when unknown. */
  status: number;
  /** True when the result was produced by FlareSolverr (CF challenge solved). */
  usedFlaresolverr: boolean;
}

/**
 * Fetches a URL, escalating through increasingly heavyweight strategies only as
 * needed:
 *
 *   1. Plain HTTP `fetch` — cheapest. If the response is a Cloudflare challenge,
 *      jump straight to FlareSolverr. If it looks JS-rendered/empty, escalate to
 *      Playwright. Otherwise return it.
 *   2. Playwright headless render — handles client-side rendering. If the
 *      rendered HTML still looks like a Cloudflare challenge, escalate.
 *   3. FlareSolverr — solves the Cloudflare challenge.
 *   4. Camoufox — anti-detect Firefox, last resort for bot protection that the
 *      above cannot beat (Akamai/DataDome, or empty/blocked renders). Tried only
 *      when the best result so far still looks blocked or empty.
 *
 * Each stage degrades gracefully: if a stage is unavailable (not installed / not
 * configured / throws), we fall back to the best HTML we have so far rather than
 * failing the whole crawl.
 */
@Injectable()
export class FetchService {
  private readonly logger = new Logger(FetchService.name);

  private readonly httpTimeoutMs = Number(process.env.HTTP_FETCH_TIMEOUT_MS ?? 15_000);

  constructor(
    private readonly playwright: PlaywrightService,
    private readonly flaresolverr: FlareSolverrService,
    private readonly camoufox: CamoufoxService,
  ) {}

  async fetch(url: string): Promise<FetchResult> {
    const candidate = await this.fetchCore(url);

    // Stage 4: if the best result so far has no usable content (empty/blocked/
    // JS-only shell), escalate to Camoufox (anti-detect Firefox) as a last
    // resort. NOTE: acceptance below is strictly content-based — a real page
    // legitimately mentions "captcha"/"akamai" in its own scripts, so anti-bot
    // *markers* must never be used to reject a fetched result, only to trigger.
    if ((candidate === null || !hasUsableContent(candidate.html)) && this.camoufox.isConfigured) {
      this.logger.debug(`Escalating ${url} to Camoufox (prior result empty/blocked)`);
      const cam = await this.tryCamoufox(url);
      if (cam && hasUsableContent(cam.html)) {
        return cam;
      }
      // Camoufox is our strongest tool; if it returned anything and we had
      // nothing usable before, prefer it over throwing.
      if (cam && candidate === null) {
        return cam;
      }
    }

    if (candidate) {
      return candidate;
    }
    throw new Error(`Failed to fetch ${url}: all strategies exhausted`);
  }

  /** Stages 1–3 (HTTP → Playwright → FlareSolverr). Returns null if all fail. */
  private async fetchCore(url: string): Promise<FetchResult | null> {
    // Stage 1: plain HTTP.
    const plain = await this.plainFetch(url);

    if (plain) {
      const cfSuspected = isCloudflareChallenge({
        status: plain.status,
        html: plain.html,
        headers: plain.headers,
      });
      if (cfSuspected) {
        this.logger.debug(`Cloudflare challenge suspected for ${url}; escalating to FlareSolverr`);
        const solved = await this.tryFlareSolverr(url);
        if (solved) {
          return solved;
        }
        // FlareSolverr unavailable — best effort: try Playwright, else raw.
        const rendered = await this.tryPlaywright(url);
        return (
          rendered ?? {
            html: plain.html,
            finalUrl: plain.finalUrl,
            status: plain.status,
            usedFlaresolverr: false,
          }
        );
      }

      if (!looksJsRendered(plain.html)) {
        return {
          html: plain.html,
          finalUrl: plain.finalUrl,
          status: plain.status,
          usedFlaresolverr: false,
        };
      }
      this.logger.debug(`Page ${url} looks JS-rendered/empty; escalating to Playwright`);
    } else {
      this.logger.debug(`Plain fetch failed for ${url}; escalating to Playwright`);
    }

    // Stage 2: Playwright render.
    const rendered = await this.tryPlaywright(url);
    if (rendered) {
      const cfAfterRender = isCloudflareChallenge({ status: 200, html: rendered.html });
      if (cfAfterRender) {
        this.logger.debug(`Rendered ${url} still shows a Cloudflare challenge; escalating`);
        const solved = await this.tryFlareSolverr(url);
        if (solved) {
          return solved;
        }
      }
      return rendered;
    }

    // Stage 3: last resort — FlareSolverr.
    const solved = await this.tryFlareSolverr(url);
    if (solved) {
      return solved;
    }

    // Nothing worked: surface whatever the plain fetch gave us, or null so the
    // caller can escalate to Camoufox.
    if (plain) {
      return {
        html: plain.html,
        finalUrl: plain.finalUrl,
        status: plain.status,
        usedFlaresolverr: false,
      };
    }
    return null;
  }

  private async plainFetch(url: string): Promise<{
    status: number;
    html: string;
    finalUrl: string;
    headers: Record<string, string>;
  } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.httpTimeoutMs);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent':
            process.env.HTTP_USER_AGENT ??
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const html = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: res.status, html, finalUrl: res.url || url, headers };
    } catch (err) {
      this.logger.debug(`Plain fetch error for ${url}: ${String(err)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async tryPlaywright(url: string): Promise<FetchResult | null> {
    try {
      const { html, finalUrl, status } = await this.playwright.render(url);
      return { html, finalUrl, status, usedFlaresolverr: false };
    } catch (err) {
      this.logger.warn(`Playwright render failed for ${url}: ${String(err)}`);
      return null;
    }
  }

  private async tryFlareSolverr(url: string): Promise<FetchResult | null> {
    if (!this.flaresolverr.isConfigured) {
      this.logger.warn('FlareSolverr not configured; cannot solve Cloudflare challenge');
      return null;
    }
    try {
      const { html, finalUrl, status } = await this.flaresolverr.solve(url);
      return { html, finalUrl, status, usedFlaresolverr: true };
    } catch (err) {
      this.logger.warn(`FlareSolverr solve failed for ${url}: ${String(err)}`);
      return null;
    }
  }

  private async tryCamoufox(url: string): Promise<FetchResult | null> {
    if (!this.camoufox.isConfigured) {
      return null;
    }
    try {
      const { html, finalUrl, status } = await this.camoufox.fetchUrl(url);
      return { html, finalUrl, status, usedFlaresolverr: false };
    } catch (err) {
      this.logger.warn(`Camoufox fetch failed for ${url}: ${String(err)}`);
      return null;
    }
  }
}

/**
 * Whether a fetched page has real, usable content (meaningful visible text),
 * as opposed to an empty/blocked/JS-only shell. Deliberately content-based:
 * never keys off anti-bot marker strings, which appear in legitimate pages too.
 */
function hasUsableContent(html: string): boolean {
  return html.trim().length > 0 && !looksJsRendered(html) && !looksLikeBlockPage(html);
}
