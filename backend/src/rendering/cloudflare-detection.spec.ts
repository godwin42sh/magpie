import { detectAntiBot, isCloudflareChallenge, looksJsRendered } from './cloudflare-detection.js';

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
