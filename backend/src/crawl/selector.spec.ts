import * as cheerio from 'cheerio';

import { resolveZone, simpleXPathToCss } from './selector.js';

describe('simpleXPathToCss', () => {
  it('converts supported XPath forms', () => {
    expect(simpleXPathToCss('//div')).toBe('div');
    expect(simpleXPathToCss("//*[@id='main']")).toBe('#main');
    expect(simpleXPathToCss("//span[@class='price']")).toBe('span.price');
    expect(simpleXPathToCss("//div[@data-test='x']")).toBe('div[data-test="x"]');
  });

  it('returns null for unsupported XPath', () => {
    expect(simpleXPathToCss('//div/span[2]/following-sibling::p')).toBeNull();
  });
});

describe('resolveZone', () => {
  it('matches the primary selector without drift', () => {
    const $ = cheerio.load('<main><p id="target">hi</p></main>');
    const r = resolveZone($, { selector: '#target' });
    expect(r.matchedBy).toBe('selector');
    expect(r.drifted).toBe(false);
    expect(r.element?.text()).toBe('hi');
  });

  it('falls back to XPath and reports drift', () => {
    const $ = cheerio.load('<main><p class="price">$10</p></main>');
    const r = resolveZone($, { selector: '#gone', fallbackXPath: "//p[@class='price']" });
    expect(r.matchedBy).toBe('xpath');
    expect(r.drifted).toBe(true);
    expect(r.element?.text()).toBe('$10');
  });

  it('falls back to fingerprint and reports drift', () => {
    const $ = cheerio.load(
      '<main><span>Other</span><span>Price is forty two dollars</span></main>',
    );
    const r = resolveZone($, {
      selector: '#gone',
      fingerprint: { tag: 'span', textLen: 27, sample: 'Price is forty' },
    });
    expect(r.matchedBy).toBe('fingerprint');
    expect(r.drifted).toBe(true);
    expect(r.element?.text()).toContain('Price');
  });

  it('returns no element when nothing matches', () => {
    const $ = cheerio.load('<main><p>nope</p></main>');
    const r = resolveZone($, { selector: '#gone' });
    expect(r.element).toBeNull();
    expect(r.matchedBy).toBe('none');
  });
});
