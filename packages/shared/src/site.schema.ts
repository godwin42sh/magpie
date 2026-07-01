import { z } from 'zod';

import { cronExpressionSchema } from './cron.schema.js';

/**
 * How a captured zone is compared between crawls.
 */
export const compareModeSchema = z.enum(['innerHTML', 'textContent']);
export type CompareMode = z.infer<typeof compareModeSchema>;

/**
 * Lightweight fingerprint of the picked element, used to re-locate it and to
 * detect when a selector has drifted.
 */
export const fingerprintSchema = z.object({
  tag: z.string(),
  textLen: z.number().int().nonnegative(),
  sample: z.string(),
});
export type Fingerprint = z.infer<typeof fingerprintSchema>;

/**
 * A monitored site + zone. This is the canonical persisted shape (user intent
 * lives in config.json).
 */
export const siteSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  url: z.url(),
  selector: z.string().min(1),
  selectorFallbackXPath: z.string().optional(),
  fingerprint: fingerprintSchema.optional(),
  compareMode: compareModeSchema.default('innerHTML'),
  enabled: z.boolean(),
  cron: cronExpressionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Site = z.infer<typeof siteSchema>;

/**
 * Payload to create a site: server owns id/createdAt/updatedAt.
 */
export const createSiteRequestSchema = siteSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateSiteRequest = z.infer<typeof createSiteRequestSchema>;

/**
 * Payload to update a site: every creatable field is optional.
 */
export const updateSiteRequestSchema = createSiteRequestSchema.partial();
export type UpdateSiteRequest = z.infer<typeof updateSiteRequestSchema>;

/**
 * What the API returns for a site: the persisted config plus a summary of its
 * machine-owned state (from the snapshot store). The state fields are optional
 * so create/update responses (which carry no state yet) still validate.
 */
export const siteResponseSchema = siteSchema.extend({
  lastCheckedAt: z.iso.datetime().nullable().optional(),
  lastChangedAt: z.iso.datetime().nullable().optional(),
  lastError: z.string().nullable().optional(),
});
export type SiteResponse = z.infer<typeof siteResponseSchema>;
