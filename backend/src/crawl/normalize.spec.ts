import { isVolatileAttr, normalizeHtml, normalizeText } from './normalize.js';

describe('normalizeText', () => {
  it('collapses whitespace runs and trims', () => {
    expect(normalizeText('  hello   world\n\t foo ')).toBe('hello world foo');
  });
});

describe('isVolatileAttr', () => {
  it('flags exact volatile attributes', () => {
    expect(isVolatileAttr('nonce')).toBe(true);
    expect(isVolatileAttr('CSRF')).toBe(true);
    expect(isVolatileAttr('data-timestamp')).toBe(true);
  });

  it('flags prefixed framework attributes', () => {
    expect(isVolatileAttr('data-reactid')).toBe(true);
    expect(isVolatileAttr('data-react-checksum')).toBe(true);
    expect(isVolatileAttr('data-v-1234abcd')).toBe(true);
  });

  it('does not flag stable attributes', () => {
    expect(isVolatileAttr('class')).toBe(false);
    expect(isVolatileAttr('href')).toBe(false);
    expect(isVolatileAttr('id')).toBe(false);
  });
});

describe('normalizeHtml', () => {
  it('produces equal output when only volatile attrs differ', () => {
    const a = `<div class="card" nonce="abc123" data-reactid="r-1">
      <span>Price: $10</span>
    </div>`;
    const b = `<div class="card" nonce="zzz999" data-reactid="r-9999">
      <span>Price: $10</span>
    </div>`;
    expect(normalizeHtml(a)).toBe(normalizeHtml(b));
  });

  it('produces different output when meaningful content differs', () => {
    const a = `<div class="card"><span>Price: $10</span></div>`;
    const b = `<div class="card"><span>Price: $20</span></div>`;
    expect(normalizeHtml(a)).not.toBe(normalizeHtml(b));
  });

  it('collapses insignificant whitespace differences', () => {
    const a = `<p>Hello    world</p>`;
    const b = `<p>Hello world</p>`;
    expect(normalizeHtml(a)).toBe(normalizeHtml(b));
  });
});
