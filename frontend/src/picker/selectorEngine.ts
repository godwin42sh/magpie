import type { Fingerprint } from '@magpie/shared';

/**
 * Framework-agnostic, DOM-pure selector generation used by the zone picker.
 *
 * Everything here takes plain `Element`/`Document` arguments and returns plain
 * data, so it can be unit-tested against a jsdom fixture with no browser,
 * no iframe, and no React.
 */

/**
 * Matches "hashed" / generated tokens that are unstable across deploys, e.g.
 * CSS-module classes (`button-1a2f9`), styled-components hashes, build-tool
 * content hashes. We treat these as noise for both ids and classes.
 */
const HASHED_TOKEN = /^[A-Za-z][\w-]*?[-_]?[0-9a-f]{5,}$/;

/**
 * Common framework/runtime-managed prefixes that are also unstable.
 */
const VOLATILE_PREFIX = /^(css-|sc-|jsx-|emotion-|chakra-|MuiBox-|svelte-|v-|ng-|data-v-)/;

/** True when a token looks generated rather than authored-and-stable. */
export function isHashedToken(token: string): boolean {
  if (token.length === 0) return false;
  if (VOLATILE_PREFIX.test(token)) return true;
  if (HASHED_TOKEN.test(token)) return true;
  // Pure hex / very long alphanumeric blobs.
  if (/^[0-9a-f]{6,}$/i.test(token)) return true;
  return false;
}

/** Keep only authored-looking, reusable class names. */
export function stableClasses(el: Element): string[] {
  const raw = el.getAttribute('class');
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && !isHashedToken(c));
}

/** A usable id is present, non-hashed, and unique in the document. */
function stableId(el: Element, root: Document | Element): string | null {
  const id = el.getAttribute('id');
  if (!id || isHashedToken(id)) return null;
  // Must be a valid simple identifier we can safely put after `#`.
  if (!/^[A-Za-z][\w-]*$/.test(id)) return null;
  const scope = root instanceof Document ? root : root.ownerDocument;
  if (!scope) return null;
  try {
    if (scope.querySelectorAll(`#${CSS.escape(id)}`).length === 1) return `#${id}`;
  } catch {
    return null;
  }
  return null;
}

/** The CSS fragment identifying one element among its siblings (no combinator). */
function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const classes = stableClasses(el);
  let segment = tag;
  if (classes.length > 0) {
    segment += classes.map((c) => `.${CSS.escape(c)}`).join('');
  }
  return segment;
}

/** Append `:nth-of-type(n)` when the segment alone is ambiguous among siblings. */
function disambiguate(el: Element, segment: string): string {
  const parent = el.parentElement;
  if (!parent) return segment;
  const tag = el.tagName.toLowerCase();
  const sameTag = Array.from(parent.children).filter((c) => c.tagName.toLowerCase() === tag);
  if (sameTag.length <= 1) return segment;
  // Among same-tag siblings, does the segment already single this one out?
  const matching = sameTag.filter((c) => c.matches(segment));
  if (matching.length <= 1) return segment;
  const index = sameTag.indexOf(el) + 1;
  return `${segment}:nth-of-type(${index})`;
}

function getDocument(node: Element | Document): Document {
  return node instanceof Document ? node : (node.ownerDocument ?? document);
}

/**
 * Build a stable, unique CSS selector for `el` within `root`'s document.
 *
 * Strategy:
 *  1. If the element has a stable, unique id → use `#id` (shortest possible).
 *  2. Otherwise walk up the ancestor chain building `tag.stableClass…`
 *     segments, adding `:nth-of-type(n)` only to break sibling ambiguity, and
 *     stop as soon as the accumulated path matches exactly one element.
 *  3. Promote any ancestor with a stable unique id to an anchor and stop.
 */
export function computeSelector(el: Element, root: Document | Element = document): string {
  const doc = getDocument(el);

  const directId = stableId(el, root);
  if (directId) return directId;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === 1) {
    // An ancestor with a stable unique id anchors the whole path.
    const anchorId = stableId(current, root);
    if (anchorId) {
      parts.unshift(anchorId);
      break;
    }

    const segment = disambiguate(current, segmentFor(current));
    parts.unshift(segment);

    const candidate = parts.join(' > ');
    // Stop early once the path is already unique from the document.
    if (uniqueInDocument(doc, candidate)) {
      return candidate;
    }

    const parent: Element | null = current.parentElement;
    if (!parent || parent === doc.documentElement) {
      current = parent;
      if (current) parts.unshift(disambiguate(current, segmentFor(current)));
      break;
    }
    current = parent;
  }

  return parts.join(' > ');
}

function uniqueInDocument(doc: Document, selector: string): boolean {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/**
 * Absolute XPath fallback, e.g. `/html/body/div[2]/section/p[1]`.
 * Always positional so it survives missing/changed ids and classes.
 */
export function computeXPath(el: Element): string {
  if (el.nodeType !== 1) return '';
  const segments: string[] = [];
  let current: Element | null = el;

  while (current && current.nodeType === 1) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      segments.unshift(tag);
      break;
    }
    const sameTag = Array.from(parent.children).filter((c) => c.tagName.toLowerCase() === tag);
    if (sameTag.length === 1) {
      segments.unshift(tag);
    } else {
      const index = sameTag.indexOf(current) + 1;
      segments.unshift(`${tag}[${index}]`);
    }
    current = parent;
  }

  return `/${segments.join('/')}`;
}

/** Collapse whitespace the way comparison/normalization will at crawl time. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Lightweight fingerprint of the picked element used to re-locate it later and
 * detect selector drift. `sample` is the first ~50 normalized characters.
 */
export function computeFingerprint(el: Element): Fingerprint {
  const tag = el.tagName.toLowerCase();
  const normalized = normalizeText(el.textContent ?? '');
  return {
    tag,
    textLen: normalized.length,
    sample: normalized.slice(0, 50),
  };
}

/** Convenience: everything the picker needs about one element in one call. */
export function describeElement(
  el: Element,
  root: Document | Element = document,
): { selector: string; xpath: string; fingerprint: Fingerprint } {
  return {
    selector: computeSelector(el, root),
    xpath: computeXPath(el),
    fingerprint: computeFingerprint(el),
  };
}
