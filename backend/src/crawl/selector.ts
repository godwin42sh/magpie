import * as cheerio from 'cheerio';
import { type AnyNode } from 'domhandler';
import { type Fingerprint } from '@magpie/shared';

/** A cheerio selection of document nodes. */
type Selection = cheerio.Cheerio<AnyNode>;
/** A single DOM node as cheerio yields it from `.toArray()`. */
type SelectionNode = AnyNode;

/** Outcome of locating the target zone in a document. */
export interface SelectorResolution {
  /** The matched element, or null if nothing matched any strategy. */
  element: Selection | null;
  /** Which strategy located the element. */
  matchedBy: 'selector' | 'xpath' | 'fingerprint' | 'none';
  /** True when the primary CSS selector failed and a fallback was used. */
  drifted: boolean;
}

/**
 * Locates the monitored zone in a loaded document, in priority order:
 *   1. the CSS `selector`,
 *   2. the optional `selectorFallbackXPath` (a *very* small XPath subset:
 *      `//tag`, `//tag[@attr='v']`, `//*[@id='v']`, indexed steps — anything
 *      richer falls through),
 *   3. the optional `fingerprint` (first element whose tag matches and whose
 *      text length is within tolerance and which contains the sample text).
 *
 * When the primary selector misses but a fallback hits, `drifted` is true so the
 * caller can emit a "selector drifted" warning instead of reporting a false
 * content change.
 */
export function resolveZone(
  $: cheerio.CheerioAPI,
  opts: {
    selector: string;
    fallbackXPath?: string | undefined;
    fingerprint?: Fingerprint | undefined;
  },
): SelectorResolution {
  const primary = $(opts.selector).first();
  if (primary.length > 0) {
    return { element: primary, matchedBy: 'selector', drifted: false };
  }

  if (opts.fallbackXPath) {
    const xpathMatch = resolveSimpleXPath($, opts.fallbackXPath);
    if (xpathMatch && xpathMatch.length > 0) {
      return { element: xpathMatch, matchedBy: 'xpath', drifted: true };
    }
  }

  if (opts.fingerprint) {
    const fpMatch = resolveByFingerprint($, opts.fingerprint);
    if (fpMatch && fpMatch.length > 0) {
      return { element: fpMatch, matchedBy: 'fingerprint', drifted: true };
    }
  }

  return { element: null, matchedBy: 'none', drifted: true };
}

/**
 * Resolves a tiny, safe subset of XPath into a cheerio selection. Supports:
 *   //tag                      → tag
 *   //*[@id='x']               → #x  (also //tag[@id='x'])
 *   //tag[@class='x']          → tag.x
 *   //tag[@attr='x']           → tag[attr='x']
 * Returns null for anything outside this subset.
 */
export function resolveSimpleXPath($: cheerio.CheerioAPI, xpath: string): Selection | null {
  const css = simpleXPathToCss(xpath);
  if (css === null) {
    return null;
  }
  const found = $(css).first();
  return found.length > 0 ? found : null;
}

/** Converts the supported XPath subset to a CSS selector, or null. */
export function simpleXPathToCss(xpath: string): string | null {
  const trimmed = xpath.trim();
  // Single-step predicate forms: //tag[@attr='value'] or //*[@attr='value']
  const predicate = /^\/\/([a-zA-Z0-9*-]+)\[@([a-zA-Z_:-]+)=['"]([^'"]*)['"]\]$/.exec(trimmed);
  if (predicate) {
    const tag = predicate[1] === '*' ? '' : predicate[1];
    const attr = predicate[2]!;
    const value = predicate[3]!;
    if (attr === 'id') {
      return `${tag}#${cssEscape(value)}`;
    }
    if (attr === 'class') {
      return `${tag}.${cssEscape(value)}`;
    }
    return `${tag}[${attr}="${value.replace(/"/g, '\\"')}"]`;
  }

  // Bare //tag
  const bare = /^\/\/([a-zA-Z0-9-]+)$/.exec(trimmed);
  if (bare) {
    return bare[1]!;
  }

  return null;
}

/**
 * Finds the first element matching the fingerprint: same tag, text length
 * within ±25% (or both short), and containing the sample substring when one was
 * captured.
 */
export function resolveByFingerprint($: cheerio.CheerioAPI, fp: Fingerprint): Selection | null {
  const sample = fp.sample.trim().toLowerCase();
  const candidates = $(fp.tag).toArray();

  let best: SelectionNode | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const node of candidates) {
    const text = $(node).text();
    const len = text.length;
    if (sample.length > 0 && !text.toLowerCase().includes(sample)) {
      continue;
    }
    const delta = Math.abs(len - fp.textLen);
    const tolerance = Math.max(8, Math.round(fp.textLen * 0.25));
    if (delta <= tolerance && delta < bestDelta) {
      best = node;
      bestDelta = delta;
    }
  }

  return best ? $(best) : null;
}

/** Computes a fresh fingerprint for an element (used to refresh after a match). */
export function computeFingerprint(el: Selection): Fingerprint {
  const node = el.get(0);
  const tag = node && node.type === 'tag' ? node.tagName : 'unknown';
  const text = el.text();
  return {
    tag,
    textLen: text.length,
    sample: text.replace(/\s+/g, ' ').trim().slice(0, 120),
  };
}

/** Minimal CSS identifier escaping for id/class values from XPath. */
function cssEscape(value: string): string {
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}
