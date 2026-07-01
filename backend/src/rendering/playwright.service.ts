import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type Browser, chromium } from 'playwright';

/** Result of rendering a URL in a headless browser. */
export interface RenderResult {
  /** Fully rendered outer HTML of the document. */
  html: string;
  /** The URL after any client/server redirects. */
  finalUrl: string;
  /** HTTP status of the main navigation response (0 if unknown). */
  status: number;
}

/**
 * Renders pages in a single, lazily-launched, reused Chromium browser.
 *
 * - The browser is launched on first use and reused across renders (each render
 *   gets its own fresh, isolated `BrowserContext`, which is disposed after).
 * - Concurrency is bounded by a small semaphore-style queue so we never open an
 *   unbounded number of contexts at once.
 * - `OnModuleDestroy` closes the browser for graceful shutdown.
 *
 * In tests this whole service is mocked — no real browser is launched.
 */
@Injectable()
export class PlaywrightService implements OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightService.name);

  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  /** Max concurrent renders. */
  private readonly maxConcurrency = Number(process.env.PLAYWRIGHT_CONCURRENCY ?? 2);
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  /** Per-navigation timeout in ms. */
  private readonly navTimeoutMs = Number(process.env.PLAYWRIGHT_NAV_TIMEOUT_MS ?? 30_000);

  /**
   * Renders `url`, waiting for the network to go idle, and returns the rendered
   * HTML + final URL. Bounded by the concurrency queue.
   */
  async render(url: string): Promise<RenderResult> {
    await this.acquire();
    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext({
        userAgent:
          process.env.PLAYWRIGHT_USER_AGENT ??
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      });
      try {
        const page = await context.newPage();
        const response = await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: this.navTimeoutMs,
        });
        const html = await page.content();
        const finalUrl = page.url();
        return { html, finalUrl, status: response?.status() ?? 0 };
      } finally {
        await context.close();
      }
    } finally {
      this.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      this.logger.log('Closing Chromium browser');
      const browser = this.browser;
      this.browser = null;
      await browser.close().catch((err: unknown) => {
        this.logger.error(`Error closing browser: ${String(err)}`);
      });
    }
  }

  /** Lazily launches (or returns) the shared browser. */
  private async getBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }
    if (this.launching) {
      return this.launching;
    }
    this.logger.log('Launching Chromium browser (headless)');
    this.launching = chromium
      .launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      .then((browser) => {
        this.browser = browser;
        this.launching = null;
        return browser;
      })
      .catch((err: unknown) => {
        this.launching = null;
        throw err;
      });
    return this.launching;
  }

  /** Acquires a concurrency slot, queueing if the limit is reached. */
  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  /** Releases a slot, waking the next waiter if any. */
  private release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}
