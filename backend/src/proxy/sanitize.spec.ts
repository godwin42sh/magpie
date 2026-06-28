import { sanitizeHtml } from './sanitize.js';

const FOREIGN_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'">
  <meta http-equiv="X-Frame-Options" content="DENY">
  <meta http-equiv="refresh" content="0; url=/login">
  <base href="https://evil.example/old">
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.example/app.js"></script>
</head>
<body>
  <h1 onclick="steal()">Title</h1>
  <a href="javascript:alert(1)">bad link</a>
  <a href="/page">good link</a>
  <script>document.cookie = 'x';</script>
  <img src="/logo.png">
</body>
</html>`;

describe('sanitizeHtml', () => {
  const out = sanitizeHtml(FOREIGN_HTML, 'https://target.example/page');

  it('neutralizes all scripts (no executable script bodies/src)', () => {
    expect(out).not.toMatch(/<script[^>]*src=/i);
    expect(out).toContain('text/neutralized');
    expect(out).not.toContain("document.cookie = 'x'");
    expect(out).not.toContain('cdn.example/app.js');
  });

  it('strips CSP / X-Frame-Options / refresh meta directives', () => {
    expect(out.toLowerCase()).not.toContain('content-security-policy');
    expect(out.toLowerCase()).not.toContain('x-frame-options');
    expect(out.toLowerCase()).not.toContain('http-equiv="refresh"');
  });

  it('removes inline event handlers', () => {
    expect(out).not.toMatch(/onclick/i);
  });

  it('removes javascript: URLs but keeps normal links', () => {
    expect(out).not.toMatch(/javascript:alert/i);
    expect(out).toContain('href="/page"');
  });

  it('injects a <base href> at the target origin and removes the old base', () => {
    expect(out).not.toContain('evil.example/old');
    expect(out).toContain('<base href="https://target.example/page">');
  });

  it('keeps stylesheet and image references so assets resolve via base', () => {
    expect(out).toContain('/styles.css');
    expect(out).toContain('/logo.png');
  });
});
