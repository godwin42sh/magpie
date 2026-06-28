import {
  detectAntiBot,
  isCloudflareChallenge,
  looksJsRendered,
  looksLikeBlockPage,
} from './cloudflare-detection.js';

const CF_CHALLENGE_HTML = `
<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body>
  <div class="cf-browser-verification cf-im-under-attack">
    <h1>Checking your browser before accessing the site.</h1>
    <div id="cf-challenge-running"></div>
  </div>
  <script>window._cf_chl_opt = {};</script>
</body></html>`;

const NORMAL_HTML = `
<!DOCTYPE html><html><head><title>Acme</title></head>
<body><main id="content"><h1>Welcome</h1><p>Hello there, this is normal content.</p></main></body></html>`;

describe('isCloudflareChallenge', () => {
  it('detects a challenge from 503 + markers + cloudflare server header', () => {
    expect(
      isCloudflareChallenge({
        status: 503,
        html: CF_CHALLENGE_HTML,
        headers: { server: 'cloudflare', 'cf-ray': 'abc123' },
      }),
    ).toBe(true);
  });

  it('detects a challenge from 403 + markers even without a server header', () => {
    expect(isCloudflareChallenge({ status: 403, html: CF_CHALLENGE_HTML })).toBe(true);
  });

  it('detects a challenge from a 200 + markers when cf-ray header is present', () => {
    expect(
      isCloudflareChallenge({
        status: 200,
        html: CF_CHALLENGE_HTML,
        headers: { 'cf-ray': 'deadbeef' },
      }),
    ).toBe(true);
  });

  it('does NOT flag normal content even on a 403 (no markers)', () => {
    expect(isCloudflareChallenge({ status: 403, html: NORMAL_HTML })).toBe(false);
  });

  it('does NOT flag a marker mentioned in normal content on a 200 with no CF headers', () => {
    const article = `<html><body><p>This blog post discusses "just a moment" UX patterns.</p></body></html>`;
    expect(isCloudflareChallenge({ status: 200, html: article })).toBe(false);
  });
});

describe('detectAntiBot', () => {
  it('detects DataDome (e.g. the Darty product page block)', () => {
    const html = `<html><head><title>darty.com</title></head><body>
      <script src="https://js.datadome.co/tags.js"></script>
      <iframe src="https://geo.captcha-delivery.com/captcha/"></iframe></body></html>`;
    expect(detectAntiBot(html)).toBe('DataDome');
  });

  it('detects PerimeterX / HUMAN and Akamai and Imperva', () => {
    expect(detectAntiBot('<div class="px-captcha"></div>')).toBe('PerimeterX / HUMAN');
    expect(detectAntiBot('<html>set-cookie ak_bmsc=... _abck=...</html>')).toBe(
      'Akamai Bot Manager',
    );
    expect(detectAntiBot('<html>Powered by Incapsula _incap_ ...</html>')).toBe(
      'Imperva / Incapsula',
    );
  });

  it('returns null for normal content and does not match a bare "captcha" mention', () => {
    expect(detectAntiBot(NORMAL_HTML)).toBeNull();
    expect(detectAntiBot('<p>We use a captcha on our signup form.</p>')).toBeNull();
  });
});

describe('looksLikeBlockPage', () => {
  it('flags an Akamai sec-cpt interactive challenge (e.g. idealo)', () => {
    const html = `<!DOCTYPE html><html><body>
      <script src="/8Mec2h7/X43?v=1&t=956720579"></script>
      <div id="sec-if-cpt-container" role="main"><div class="behavioral-content"></div>
      <p class="scf-akamai-protected-by">Powered and protected by</p></div></body></html>`;
    expect(looksLikeBlockPage(html)).toBe(true);
  });

  it('flags a WAF error page with a vendor reference id', () => {
    const html = `<html><body><section><p>Sorry! Something has gone wrong.</p>
      <p>... reference ID <i>0.708655f.1782682307.16689a0a</i> ...</p></section></body></html>`;
    expect(looksLikeBlockPage(html)).toBe(true);
  });

  it('does NOT flag a real product page that merely references akamai/captcha in scripts', () => {
    const html = `<html><head><title>Climatiseur Midea | Darty</title></head><body>
      <div class="buybox"><p>Bientôt de retour en stock</p></div>
      <script src="https://cdn.example.com/akamai/boomerang.js"></script>
      <noscript>please complete the captcha</noscript>
      ${'<p>real product content here.</p>'.repeat(50)}</body></html>`;
    expect(looksLikeBlockPage(html)).toBe(false);
  });

  it('does NOT flag normal content', () => {
    expect(looksLikeBlockPage(NORMAL_HTML)).toBe(false);
  });
});

describe('looksJsRendered', () => {
  it('treats empty HTML as JS-rendered', () => {
    expect(looksJsRendered('')).toBe(true);
    expect(looksJsRendered('   ')).toBe(true);
  });

  it('treats an empty SPA shell with scripts as JS-rendered', () => {
    const shell = `<html><body><div id="root"></div><script src="/app.js"></script></body></html>`;
    expect(looksJsRendered(shell)).toBe(true);
  });

  it('treats a content-rich page as not JS-rendered', () => {
    expect(looksJsRendered(NORMAL_HTML)).toBe(false);
  });
});
