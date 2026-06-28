import { z } from 'zod';

import { fingerprintSchema } from './site.schema.js';

/**
 * A single recorded change for a site.
 */
export const changeEventSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  at: z.iso.datetime(),
  oldHash: z.string(),
  newHash: z.string(),
  diff: z.string().optional(),
});
export type ChangeEvent = z.infer<typeof changeEventSchema>;

/**
 * Machine-owned snapshot state for a site, persisted to
 * `state/<siteId>.json` (separate from user intent in config.json).
 */
export const siteStateSchema = z.object({
  siteId: z.uuid(),
  lastHash: z.string().nullable(),
  lastSnapshot: z.string().nullable(),
  fingerprint: fingerprintSchema.optional(),
  lastCheckedAt: z.iso.datetime().nullable(),
  lastChangedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  history: z.array(changeEventSchema),
});
export type SiteState = z.infer<typeof siteStateSchema>;
