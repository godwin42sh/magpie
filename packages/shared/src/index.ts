/**
 * @magpie/shared — single source of truth for data contracts.
 *
 * All Zod v4 schemas live here; every TypeScript type is derived via z.infer.
 * Both the frontend and backend import from this package via "workspace:*".
 */

export * from './cron.schema.js';
export * from './presets.js';
export * from './site.schema.js';
export * from './api.schema.js';
export * from './state.schema.js';
