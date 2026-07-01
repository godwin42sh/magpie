import { Injectable, Logger } from '@nestjs/common';

/** A cookie as returned by FlareSolverr. */
export interface FlareSolverrCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

/** Normalized result of a FlareSolverr solve. */
export interface FlareSolverrResult {
  html: string;
  finalUrl: string;
  /** HTTP status of the solved page (0 if unknown). */
  status: number;
  cookies: FlareSolverrCookie[];
  userAgent: string | undefined;
}

/** Shape of the FlareSolverr `/v1` response we care about. */
interface FlareSolverrResponse {
  status?: string;
  message?: string;
  solution?: {
    url?: string;
    status?: number;
    response?: string;
    cookies?: FlareSolverrCookie[];
    userAgent?: string;
  };
}

/**
 * Thin wrapper over a running FlareSolverr instance. FlareSolverr drives a real
 * browser to solve Cloudflare challenges and returns the solved HTML + cookies.
 *
 * The base URL comes from `FLARESOLVERR_URL` (e.g. http://localhost:8191). When
 * unset, {@link isConfigured} is false and {@link solve} throws — the
 * FetchService treats an unconfigured FlareSolverr as "cannot escalate".
 *
 * Uses the built-in `fetch`, so tests can mock `globalThis.fetch`.
 */
@Injectable()
export class FlareSolverrService {
  private readonly logger = new Logger(FlareSolverrService.name);

  private readonly timeoutMs = Number(process.env.FLARESOLVERR_TIMEOUT_MS ?? 60_000);

  /** True when a FlareSolverr endpoint is configured. */
  get isConfigured(): boolean {
    return Boolean(this.baseUrl());
  }

  /**
   * Solves `url` via FlareSolverr's `request.get` command. Throws if not
   * configured, if the HTTP call fails, or if FlareSolverr reports a non-ok
   * status.
   */
  async solve(url: string): Promise<FlareSolverrResult> {
    const base = this.baseUrl();
    if (!base) {
      throw new Error('FLARESOLVERR_URL is not configured');
    }
    const endpoint = `${base.replace(/\/+$/, '')}/v1`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cmd: 'request.get',
        url,
        maxTimeout: this.timeoutMs,
      }),
    });

    if (!res.ok) {
      throw new Error(`FlareSolverr HTTP ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as FlareSolverrResponse;
    if (body.status !== 'ok' || !body.solution) {
      throw new Error(`FlareSolverr failed: ${body.message ?? body.status ?? 'unknown error'}`);
    }

    const { solution } = body;
    this.logger.debug(`FlareSolverr solved ${url}`);
    return {
      html: solution.response ?? '',
      finalUrl: solution.url ?? url,
      status: solution.status ?? 0,
      cookies: solution.cookies ?? [],
      userAgent: solution.userAgent,
    };
  }

  private baseUrl(): string | undefined {
    const url = process.env.FLARESOLVERR_URL?.trim();
    return url && url.length > 0 ? url : undefined;
  }
}
