import cronstrue from 'cronstrue';

/**
 * Render a cron expression as an English phrase. Falls back to the raw
 * expression if cronstrue cannot parse it (the input is still server-validated
 * by `cronExpressionSchema`, so this is purely defensive for display).
 */
export function describeCron(expression: string): string {
  try {
    return cronstrue.toString(expression, { verbose: false });
  } catch {
    return expression;
  }
}

/**
 * Format an ISO timestamp for display, or a placeholder when absent.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/**
 * Relative-ish short label, e.g. for "last checked". Falls back to absolute.
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} d ago`;
}
