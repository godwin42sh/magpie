/**
 * Pure heuristics for detecting a Cloudflare (or similar) anti-bot challenge
 * interstitial from an HTTP response. Kept dependency-free and side-effect-free
 * so it can be unit-tested against fixtures.
 */

/** Markers that strongly indicate a Cloudflare challenge/interstitial page. */
const CF_HTML_MARKERS: readonly string[] = [
  'cf-browser-verification',
  'cf_chl_opt',
  'cf-challenge',
  'challenge-platform',
  'cf-im-under-attack',
  '__cf_chl_',
  'turnstile',
  'jschl-answer',
  'jschl_vc',
  'checking your browser before accessing',
  'attention required! | cloudflare',
  'just a moment',
  'enable javascript and cookies to continue',
  'ddos protection by cloudflare',
  'ray id',
];

/** HTTP statuses Cloudflare uses for challenge / block responses. */
const CF_CHALLENGE_STATUSES: ReadonlySet<number> = new Set([403, 429, 503]);

/** Header (lowercased) that identifies the edge as Cloudflare. */
const CF_SERVER_HEADER = 'cloudflare';

export interface CloudflareDetectionInput {
  /** HTTP status code of the response. */
  status: number;
  /** Response body (HTML). May be empty. */
  html: string;
  /**
   * Response headers as a plain record (lowercased keys recommended; this
   * function lowercases lookups defensively).
   */
  headers?: Readonly<Record<string, string | undefined>>;
}

/**
 * Returns true when the response looks like a Cloudflare challenge that a plain
 * HTTP fetch cannot get past (and that warrants escalation to FlareSolverr).
 *
 * The decision combines two weak signals into a strong one:
 *  - a challenge-class status (403/429/503) OR a `server: cloudflare` header,
 *    AND
 *  - at least one challenge marker in the HTML body.
 *
 * A marker alone (e.g. the literal phrase quoted in an article) is not enough;
 * a challenge status alone is not enough either (could be a normal 403). Their
 * combination is what distinguishes a real interstitial.
 */
export function isCloudflareChallenge(input: CloudflareDetectionInput): boolean {
  const haystack = input.html.toLowerCase();
  const hasMarker = CF_HTML_MARKERS.some((marker) => haystack.includes(marker));
  if (!hasMarker) {
    return false;
  }

  const server = (input.headers?.['server'] ?? '').toLowerCase();
  const cfHeaderPresent =
    server.includes(CF_SERVER_HEADER) ||
    input.headers?.['cf-ray'] !== undefined ||
    input.headers?.['cf-mitigated'] !== undefined;

  const challengeStatus = CF_CHALLENGE_STATUSES.has(input.status);

  return challengeStatus || cfHeaderPresent;
}

/**
 * Non-Cloudflare anti-bot providers, by name and body markers. FlareSolverr
 * only solves Cloudflare challenges, so when one of these is detected the
 * content generally cannot be retrieved by this stack — detecting it lets the
 * crawl surface an honest, actionable error instead of a misleading
 * "selector matched no element".
 */
const ANTIBOT_PROVIDERS: ReadonlyArray<{ name: string; markers: readonly string[] }> = [
  { name: 'DataDome', markers: ['datadome', 'captcha-delivery.com', 'geo.captcha-delivery'] },
  { name: 'PerimeterX / HUMAN', markers: ['px-captcha', 'perimeterx', '_pxhd'] },
  { name: 'Akamai Bot Manager', markers: ['ak_bmsc', '_abck', 'akamai'] },
  { name: 'Imperva / Incapsula', markers: ['incapsula', '_incap_', 'imperva'] },
];

/**
 * Detects a non-Cloudflare anti-bot interstitial (DataDome, PerimeterX, Akamai,
 * Imperva) from response HTML. Returns the provider's name, or null when none
 * of the specific providers are recognized. Intentionally provider-specific (no
 * bare "captcha" match) to avoid flagging pages that merely mention a CAPTCHA.
 */
export function detectAntiBot(html: string): string | null {
  const haystack = html.toLowerCase();
  for (const provider of ANTIBOT_PROVIDERS) {
    if (provider.markers.some((marker) => haystack.includes(marker))) {
      return provider.name;
    }
  }
  return null;
}

/**
 * Structural markers of a bot-block / interactive-challenge / error interstitial
 * — i.e. a page that *renders* (has some text) but is NOT the real content.
 * Distinct from {@link detectAntiBot} (which keys off vendor cookie/script
 * names): these identify the challenge/error PAGE itself. Kept highly specific
 * so legitimate pages are not flagged.
 */
const BLOCK_PAGE_MARKERS: readonly string[] = [
  'sec-if-cpt', // Akamai sec-cpt challenge container (e.g. idealo)
  'sec-cpt-if',
  'powered and protected by', // Akamai challenge footer
  'behavioral-content', // Akamai sec-cpt
  'px-captcha', // PerimeterX / HUMAN
  'press & hold', // PerimeterX
  'geo.captcha-delivery.com', // DataDome
];

/** Akamai/Incapsula-style reference token, e.g. "0.708655f.1782682307.16689a0a". */
const REFERENCE_ID_TOKEN = /\b[0-9a-f]+\.[0-9a-f]+\.\d{8,}\.[0-9a-f]+\b/i;
/** Phrases typical of a WAF/anti-bot error or block page. */
const BLOCK_PAGE_PHRASE =
  /(something has gone wrong|access denied|request unsuccessful|pardon our interruption|unusual traffic|reference\s*(id|#|number))/i;

/**
 * Whether the HTML is a recognizable bot-block, interactive-challenge, or
 * anti-bot error page rather than real content. Used to (a) trigger escalation
 * to the heaviest fetch tier and (b) refuse to hand such a page to the zone
 * picker / treat it as a real crawl result.
 */
export function looksLikeBlockPage(html: string): boolean {
  const lower = html.toLowerCase();
  if (BLOCK_PAGE_MARKERS.some((marker) => lower.includes(marker))) {
    return true;
  }
  // A WAF error/block page: a block phrase plus a vendor reference id.
  return BLOCK_PAGE_PHRASE.test(html) && REFERENCE_ID_TOKEN.test(html);
}

/**
 * Heuristic: does the response look "empty" or JS-rendered, such that a plain
 * fetch is insufficient and we should escalate to a headless browser? This is
 * intentionally conservative — it triggers when the body has essentially no
 * meaningful content or is dominated by `<script>` with little visible markup.
 */
export function looksJsRendered(html: string): boolean {
  const trimmed = html.trim();
  if (trimmed.length === 0) {
    return true;
  }

  // Strip script/style/comments, then strip tags; what remains is visible text.
  const withoutScripts = trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const visibleText = withoutScripts
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // A near-empty <body> with scripts present is the classic SPA shell.
  const hasScripts = /<script[\s>]/i.test(trimmed);
  if (hasScripts && visibleText.length < 64) {
    return true;
  }

  // Almost no visible text at all, regardless of scripts.
  return visibleText.length < 16;
}
