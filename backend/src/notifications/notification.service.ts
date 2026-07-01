import { setTimeout as sleep } from 'node:timers/promises';

import { Injectable, Logger } from '@nestjs/common';
import { type Site } from '@magpie/shared';

/**
 * Posts change notifications to a Discord/Slack-compatible incoming webhook.
 *
 * The payload `{ content, text }` satisfies both Discord (`content`) and Slack
 * (`text`) so a single shape works for either. The webhook URL comes from the
 * `NOTIFY_WEBHOOK_URL` env var.
 *
 * Per-site webhook overrides are intended (a future `notifyWebhookUrl` field on
 * the site), but the shared schema is owned elsewhere; `notify()` already
 * accepts an optional override argument so callers can pass one once the field
 * lands. For now only the env URL is used unless an override is supplied.
 *
 * The service is plain and injectable so tests can mock `globalThis.fetch` or
 * substitute the provider entirely.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /** True when a default webhook URL is configured. */
  get isConfigured(): boolean {
    return Boolean(this.defaultWebhookUrl());
  }

  /**
   * Sends a human-readable change notification. If no webhook URL is available
   * (neither override nor env), it logs and returns false without throwing —
   * notification failures must never break a crawl.
   */
  async notifyChange(
    site: Pick<Site, 'name' | 'url'>,
    change: { preview: string },
    overrideWebhookUrl?: string,
  ): Promise<boolean> {
    const message =
      `**Change detected** on "${site.name}"\n` + `${site.url}\n\n` + `${change.preview}`;
    return this.send(message, overrideWebhookUrl);
  }

  /**
   * Posts an arbitrary message to the resolved webhook. Returns whether the
   * POST succeeded; never throws on network/HTTP errors (logged instead).
   */
  async send(message: string, overrideWebhookUrl?: string): Promise<boolean> {
    const url = overrideWebhookUrl ?? this.defaultWebhookUrl();
    if (!url) {
      this.logger.warn('No NOTIFY_WEBHOOK_URL configured; skipping notification');
      return false;
    }

    const body = JSON.stringify({ username: 'Magpie', content: message, text: message });
    const maxAttempts = Math.max(1, Number(process.env.NOTIFY_RETRY_ATTEMPTS ?? 3));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const last = attempt === maxAttempts;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        if (res.ok) {
          return true;
        }
        // Retry transient failures (429 rate-limit, 5xx); give up on other 4xx
        // (e.g. a bad/deleted webhook) where retrying can't help.
        const retryable = res.status === 429 || res.status >= 500;
        this.logger.error(
          `Webhook POST failed: ${res.status} ${res.statusText}` +
            (retryable && !last ? ` (attempt ${attempt}/${maxAttempts}, retrying)` : ''),
        );
        if (!retryable) {
          return false;
        }
      } catch (err) {
        this.logger.error(`Webhook POST threw (attempt ${attempt}/${maxAttempts}): ${String(err)}`);
      }
      if (!last) {
        // Exponential backoff: 1s, 2s, 4s, … (capped at 30s).
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 30_000));
      }
    }
    return false;
  }

  private defaultWebhookUrl(): string | undefined {
    const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
    return url && url.length > 0 ? url : undefined;
  }
}
