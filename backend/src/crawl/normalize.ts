import * as cheerio from 'cheerio';

/**
 * Attribute names that are volatile between otherwise-identical renders and
 * must be stripped before hashing, or they would produce false "changes".
 * Matched case-insensitively; `data-react*` / `data-reactid` style attributes
 * are matched by prefix below.
 */
const VOLATILE_ATTR_EXACT: ReadonlySet<string> = new Set([
  'nonce',
  'csrf',
  'csrf-token',
  'data-csrf',
  'data-nonce',
  'data-timestamp',
  'data-time',
  'data-ts',
  'data-uid',
  'data-id',
  'data-reactid',
  'data-react-checksum',
  'data-turbo-track',
  'data-v-',
]);

/** Attribute name prefixes considered volatile (framework hydration ids). */
const VOLATILE_ATTR_PREFIX: readonly string[] = [
  'data-react',
  'data-v-',
  'data-svelte',
  'aria-describedby',
];

/**
 * Normalizes a fragment of HTML (or text) so that semantically-equal content
 * hashes equal:
 *  - strips volatile attributes (nonce, csrf, data-react*, timestamp/id-ish),
 *  - collapses all runs of whitespace to a single space and trims.
 *
 * Used for `compareMode: 'innerHTML'`. For `textContent` mode, callers pass the
 * extracted text through {@link normalizeText} instead.
 */
export function normalizeHtml(html: string): string {
  const $ = cheerio.load(html, null, false);

  const elements = $('*').toArray();
  for (const el of elements) {
    if (el.type !== 'tag') {
      continue;
    }
    for (const name of Object.keys(el.attribs)) {
      if (isVolatileAttr(name)) {
        $(el).removeAttr(name);
      }
    }
  }

  return normalizeText($.html());
}

/** Collapses whitespace runs to single spaces and trims. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** True when an attribute name is considered volatile and should be stripped. */
export function isVolatileAttr(name: string): boolean {
  const lower = name.toLowerCase();
  if (VOLATILE_ATTR_EXACT.has(lower)) {
    return true;
  }
  return VOLATILE_ATTR_PREFIX.some((prefix) => lower.startsWith(prefix));
}
