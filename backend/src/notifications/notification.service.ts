import { Injectable, Logger } from '@nestjs/common';
import { type ChangeEvent, type Site } from '@magpie/shared';

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
    event: Pick<ChangeEvent, 'at' | 'oldHash' | 'newHash'>,
    overrideWebhookUrl?: string,
  ): Promise<boolean> {
    const message =
      `**Change detected** on "${site.name}"\n` +
      `${site.url}\n` +
      `at ${event.at}\n` +
      `${event.oldHash} -> ${event.newHash}`;
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

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'Magpie', content: message, text: message }),
      });
      if (!res.ok) {
        this.logger.error(`Webhook POST failed: ${res.status} ${res.statusText}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Webhook POST threw: ${String(err)}`);
      return false;
    }
  }

  private defaultWebhookUrl(): string | undefined {
    const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
    return url && url.length > 0 ? url : undefined;
  }
}
