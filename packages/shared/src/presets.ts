/**
 * Named cron presets exposed in the UI. The values are valid 5-field cron
 * expressions and must pass `cronExpressionSchema`.
 */
export const CRON_PRESETS = {
  'every-5-min': '*/5 * * * *',
  'every-30-min': '*/30 * * * *',
  'every-hour': '0 * * * *',
  'every-6-hours': '0 */6 * * *',
  'every-day': '0 0 * * *',
} as const;

export type CronPresetKey = keyof typeof CRON_PRESETS;
export type CronPresetValue = (typeof CRON_PRESETS)[CronPresetKey];
