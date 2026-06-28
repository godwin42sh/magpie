import { z } from 'zod';

/**
 * Request to the backend "render this page for me" proxy (used by the zone
 * picker). The backend renders the URL with Playwright, neutralizes scripts,
 * and returns sanitized same-origin HTML.
 */
export const proxyRenderRequestSchema = z.object({
  url: z.url(),
});
export type ProxyRenderRequest = z.infer<typeof proxyRenderRequestSchema>;

export const proxyRenderResponseSchema = z.object({
  html: z.string(),
  finalUrl: z.string(),
  usedFlaresolverr: z.boolean(),
});
export type ProxyRenderResponse = z.infer<typeof proxyRenderResponseSchema>;
