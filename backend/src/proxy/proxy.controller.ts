import { Controller, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import * as cheerio from 'cheerio';
import {
  proxyRenderRequestSchema,
  type ProxyRenderRequest,
  type ProxyRenderResponse,
} from '@magpie/shared';

import { ZodBody } from '../common/zod-body.decorator.js';
import { detectAntiBot } from '../rendering/cloudflare-detection.js';
import { FetchService } from '../rendering/fetch.service.js';
import { sanitizeHtml } from './sanitize.js';

/**
 * Backend proxy used by the zone picker. The frontend cannot fetch + embed a
 * foreign page directly (cross-origin + CSP + X-Frame-Options), so it asks the
 * backend to render and sanitize the page, then drops the result into a
 * same-origin `<iframe srcdoc>`.
 */
@Controller('proxy')
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly fetcher: FetchService) {}

  /**
   * POST /api/proxy/render — render `url` (escalating HTTP → Playwright →
   * FlareSolverr as needed), strip scripts + framing/CSP directives, inject a
   * `<base href>`, and return the sanitized HTML for srcdoc embedding.
   */
  @Post('render')
  async render(
    @ZodBody(proxyRenderRequestSchema) body: ProxyRenderRequest,
  ): Promise<ProxyRenderResponse> {
    this.logger.log(`Proxy render: ${body.url}`);
    const result = await this.fetcher.fetch(body.url);
    const html = sanitizeHtml(result.html, result.finalUrl);

    // Refuse to hand the picker a blank page. A bot-protected site (Akamai WAF,
    // Cloudflare, DataDome, …) typically answers an automated/headless request
    // with an empty document or a challenge, so the rendered body has nothing to
    // pick from. Surface an honest, actionable error instead of a blank iframe.
    const $ = cheerio.load(html);
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const bodyElements = $('body *').length;
    if (bodyText.length === 0 && bodyElements === 0) {
      const provider = detectAntiBot(result.html);
      const reason = provider
        ? `it appears to be protected by ${provider}, which blocks automated requests`
        : 'it returned an empty document — usually an anti-bot system or WAF ' +
          '(e.g. Akamai, Cloudflare, DataDome) blocking the request, or a page that ' +
          'requires login/JavaScript we cannot run server-side';
      const message = `Could not load "${body.url}" for zone selection: ${reason}. Zone picking is not possible for this page.`;
      this.logger.warn(message);
      throw new HttpException(message, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return {
      html,
      finalUrl: result.finalUrl,
      usedFlaresolverr: result.usedFlaresolverr,
    };
  }
}
