import { CamoufoxService } from './camoufox.service.js';

describe('CamoufoxService', () => {
  const realFetch = globalThis.fetch;
  const realUrl = process.env.CAMOUFOX_URL;

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realUrl === undefined) delete process.env.CAMOUFOX_URL;
    else process.env.CAMOUFOX_URL = realUrl;
  });

  it('isConfigured reflects CAMOUFOX_URL', () => {
    delete process.env.CAMOUFOX_URL;
    expect(new CamoufoxService().isConfigured).toBe(false);
    process.env.CAMOUFOX_URL = 'http://camoufox:8192';
    expect(new CamoufoxService().isConfigured).toBe(true);
  });

  it('throws when not configured', async () => {
    delete process.env.CAMOUFOX_URL;
    await expect(new CamoufoxService().fetchUrl('https://x.test')).rejects.toThrow(
      /CAMOUFOX_URL is not configured/,
    );
  });

  it('returns normalized result on success', async () => {
    process.env.CAMOUFOX_URL = 'http://camoufox:8192';
    const body = {
      status: 200,
      html: '<html><body>ok</body></html>',
      finalUrl: 'https://x.test/final',
    };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const result = await new CamoufoxService().fetchUrl('https://x.test');
    expect(result).toEqual({ status: 200, html: body.html, finalUrl: body.finalUrl });
  });

  it('throws when the sidecar reports an error', async () => {
    process.env.CAMOUFOX_URL = 'http://camoufox:8192';
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'no response' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await expect(new CamoufoxService().fetchUrl('https://x.test')).rejects.toThrow(
      /Camoufox failed: no response/,
    );
  });
});
