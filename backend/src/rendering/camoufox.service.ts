import { Injectable, Logger } from '@nestjs/common';

/** Normalized result of a Camoufox fetch. */
export interface CamoufoxResult {
  status: number;
  html: string;
  finalUrl: string;
}

/** Shape of the Camoufox sidecar `/fetch` response. */
interface CamoufoxResponse {
  status?: number;
  html?: string;
  finalUrl?: string;
  error?: string;
}

/**
 * Thin wrapper over the Camoufox fetch sidecar (see `/camoufox`). Camoufox is an
 * anti-detect Firefox that defeats bot protection (Akamai, DataDome, Cloudflare)
 * which rejects plain headless Chromium and which FlareSolverr (Cloudflare-only)
 * cannot solve. It is the heaviest, last-resort tier of the fetch escalation.
 *
 * The base URL comes from `CAMOUFOX_URL` (e.g. http://camoufox:8192). When unset,
 * {@link isConfigured} is false and {@link fetchUrl} throws — the FetchService
 * treats an unconfigured Camoufox as "cannot escalate".
 *
 * Uses the built-in `fetch`, so tests can mock `globalThis.fetch`.
 */
@Injectable()
export class CamoufoxService {
  private readonly logger = new Logger(CamoufoxService.name);

  private readonly timeoutMs = Number(process.env.CAMOUFOX_TIMEOUT_MS ?? 90_000);

  /** True when a Camoufox endpoint is configured. */
  get isConfigured(): boolean {
    return Boolean(this.baseUrl());
  }

  /**
   * Fetches `url` through Camoufox. Throws if not configured, if the HTTP call
   * fails, or if the sidecar reports an error.
   */
  async fetchUrl(url: string): Promise<CamoufoxResult> {
    const base = this.baseUrl();
    if (!base) {
      throw new Error('CAMOUFOX_URL is not configured');
    }
    const endpoint = `${base.replace(/\/+$/, '')}/fetch`;

    // Give the HTTP call a little more headroom than the browser timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs + 15_000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, timeoutMs: this.timeoutMs }),
        signal: controller.signal,
      });

      const body = (await res.json()) as CamoufoxResponse;
      if (!res.ok || body.error) {
        throw new Error(`Camoufox failed: ${body.error ?? `HTTP ${res.status}`}`);
      }

      this.logger.debug(`Camoufox fetched ${url} (status ${body.status ?? 'unknown'})`);
      return {
        status: body.status ?? 0,
        html: body.html ?? '',
        finalUrl: body.finalUrl ?? url,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private baseUrl(): string | undefined {
    const url = process.env.CAMOUFOX_URL?.trim();
    return url && url.length > 0 ? url : undefined;
  }
}
