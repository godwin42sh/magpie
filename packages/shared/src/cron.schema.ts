import { CronExpressionParser } from 'cron-parser';
import { z } from 'zod';

/**
 * A cron expression validated with the `cron-parser` package.
 * Rejects any string that cron-parser cannot parse.
 */
export const cronExpressionSchema = z
  .string()
  .trim()
  .min(1, 'Cron expression is required')
  .refine(
    (value) => {
      try {
        CronExpressionParser.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid cron expression' },
  );

export type CronExpression = z.infer<typeof cronExpressionSchema>;
