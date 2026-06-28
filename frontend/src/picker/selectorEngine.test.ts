import { describe, expect, it } from 'vitest';

import {
  computeFingerprint,
  computeSelector,
  computeXPath,
  isHashedToken,
  normalizeText,
  stableClasses,
} from './selectorEngine.js';

/** Parse an HTML fragment into a standalone document for testing. */
function makeDoc(bodyHtml: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${bodyHtml}</body></html>`,
    'text/html',
  );
}

const q = (doc: Document, sel: string): Element => {
  const el = doc.querySelector(sel);
  if (!el) throw new Error(`fixture missing: ${sel}`);
  return el;
};

describe('isHashedToken', () => {
  it('flags css-module / styled hashes', () => {
    expect(isHashedToken('button-1a2f9')).toBe(true);
    expect(isHashedToken('Header_root__9bC3d'.toLowerCase())).toBe(true);
    expect(isHashedToken('css-1q2w3e')).toBe(true);
    expect(isHashedToken('sc-bdVaJa')).toBe(true);
    expect(isHashedToken('deadbeef')).toBe(true);
  });

  it('keeps authored class names', () => {
    expect(isHashedToken('product')).toBe(false);
    expect(isHashedToken('price-tag')).toBe(false);
    expect(isHashedToken('nav')).toBe(false);
    expect(isHashedToken('col-6')).toBe(false);
  });
});

describe('stableClasses', () => {
  it('filters hashed/volatile classes, keeps stable ones', () => {
    const doc = makeDoc('<div class="card css-9ab12 product price-3f4a1b"></div>');
    const el = q(doc, 'div');
    expect(stableClasses(el)).toEqual(['card', 'product']);
  });
});

describe('computeSelector — unique non-hashed id', () => {
  it('uses #id directly when stable and unique', () => {
    const doc = makeDoc('<main><section id="content"><p>hi</p></section></main>');
    const el = q(doc, '#content');
    expect(computeSelector(el, doc)).toBe('#content');
  });

  it('ignores a hashed id and falls back to a structural path', () => {
    const doc = makeDoc('<main><section id="root-9f8e7d6"><p>hi</p></section></main>');
    const el = q(doc, 'section');
    const sel = computeSelector(el, doc);
    expect(sel).not.toContain('#');
    expect(doc.querySelectorAll(sel)).toHaveLength(1);
    expect(doc.querySelector(sel)).toBe(el);
  });
});

describe('computeSelector — ambiguous siblings need nth-of-type', () => {
  it('disambiguates identical siblings positionally', () => {
    const doc = makeDoc(
      '<ul class="list"><li class="item">a</li><li class="item">b</li><li class="item">c</li></ul>',
    );
    const items = doc.querySelectorAll('li.item');
    const second = items[1];
    if (!second) throw new Error('fixture');
    const sel = computeSelector(second, doc);
    expect(sel).toContain(':nth-of-type(2)');
    expect(doc.querySelectorAll(sel)).toHaveLength(1);
    expect(doc.querySelector(sel)).toBe(second);
  });

  it('does NOT add nth-of-type when a stable class already disambiguates', () => {
    const doc = makeDoc(
      '<ul class="list"><li class="item featured">a</li><li class="item">b</li></ul>',
    );
    const featured = q(doc, 'li.featured');
    const sel = computeSelector(featured, doc);
    expect(sel).not.toContain('nth-of-type');
    expect(doc.querySelector(sel)).toBe(featured);
  });
});

describe('computeSelector — anchors on an ancestor id', () => {
  it('returns the shortest unique path (stops as soon as unique)', () => {
    const doc = makeDoc('<div id="app"><div class="wrap"><span class="label">x</span></div></div>');
    const span = q(doc, 'span.label');
    const sel = computeSelector(span, doc);
    // `span.label` is already unique, so we stop without climbing further.
    expect(doc.querySelectorAll(sel)).toHaveLength(1);
    expect(doc.querySelector(sel)).toBe(span);
  });

  it('climbs into a stable ancestor id to disambiguate when needed', () => {
    // Two identical sibling spans only become unique by anchoring on #app,
    // which itself sits among ambiguous wrappers.
    const doc = makeDoc(
      '<div class="wrap"><span>a</span><span>b</span></div>' +
        '<div id="app" class="wrap"><span>x</span><span>y</span></div>',
    );
    const target = q(doc, '#app').querySelectorAll('span')[1];
    if (!target) throw new Error('fixture');
    const sel = computeSelector(target, doc);
    expect(sel.startsWith('#app')).toBe(true);
    expect(sel).toContain(':nth-of-type(2)');
    expect(doc.querySelector(sel)).toBe(target);
  });
});

describe('computeXPath', () => {
  it('produces a unique positional path', () => {
    const doc = makeDoc('<div><p>one</p><p>two</p></div>');
    const second = doc.querySelectorAll('p')[1];
    if (!second) throw new Error('fixture');
    const xp = computeXPath(second);
    expect(xp).toBe('/html/body/div/p[2]');
    const result = doc.evaluate(
      xp,
      doc,
      null,
      // ORDERED_NODE_SNAPSHOT_TYPE
      7,
      null,
    );
    expect(result.snapshotLength).toBe(1);
    expect(result.snapshotItem(0)).toBe(second);
  });
});

describe('computeFingerprint / normalizeText', () => {
  it('collapses whitespace and samples the first 50 chars', () => {
    expect(normalizeText('  a\n\t b   c ')).toBe('a b c');
    const doc = makeDoc(
      '<p>  The quick brown fox jumps over the lazy dog and then keeps going  </p>',
    );
    const fp = computeFingerprint(q(doc, 'p'));
    expect(fp.tag).toBe('p');
    expect(fp.sample).toBe('The quick brown fox jumps over the lazy dog and th');
    expect(fp.sample.length).toBe(50);
    expect(fp.textLen).toBeGreaterThan(50);
  });
});
