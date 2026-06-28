// E2E harness server — a single Node HTTP server with three jobs:
//
//   1. Serve a MUTABLE fixture page at GET /fixture
//      The page's monitored zone (#zone) renders whatever string the test last
//      pushed via POST /control/fixture. This lets the test change the page
//      between crawl runs to trigger a real change-detection event — without
//      ever touching a real third-party site.
//
//   2. Receive notification webhooks at POST /webhook
//      The backend's NotificationService POSTs here when a change is detected.
//      Every received body is recorded in memory.
//
//   3. Expose control/inspection endpoints for the test:
//      POST /control/fixture   { content }   → set the zone's content
//      GET  /control/webhooks                → list received webhook payloads
//      POST /control/reset                   → clear webhooks + reset content
//      GET  /healthz                         → readiness probe
//
// It binds 0.0.0.0 so it is reachable both from the host (Playwright runner)
// and from the backend container (via host.docker.internal) in docker mode.
//
// Configure with HARNESS_PORT (default 8390).

import { createServer } from 'node:http';

const PORT = Number(process.env.HARNESS_PORT ?? 8390);

const state = {
  content: 'initial content',
  webhooks: [],
};

function fixtureHtml(content) {
  // A deliberately simple, static page. The backend renders it with Playwright
  // and extracts the #zone element per the picked selector.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>E2E Fixture Page</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; }
      #zone { padding: 1rem; border: 2px solid #2563eb; border-radius: 8px; }
      header, footer { color: #666; }
    </style>
  </head>
  <body>
    <header><h1>Fixture under test</h1></header>
    <main>
      <p>Stable preamble that never changes.</p>
      <div id="zone">${content}</div>
      <p>Stable epilogue that never changes.</p>
    </main>
    <footer>e2e fixture</footer>
  </body>
</html>`;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/healthz') {
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && path === '/fixture') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(fixtureHtml(state.content));
  }

  if (req.method === 'POST' && path === '/webhook') {
    const raw = await readBody(req);
    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* keep raw string */
    }
    state.webhooks.push({ receivedAt: new Date().toISOString(), body: parsed });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && path === '/control/fixture') {
    const raw = await readBody(req);
    const body = raw.length > 0 ? JSON.parse(raw) : {};
    state.content = String(body.content ?? '');
    return json(res, 200, { ok: true, content: state.content });
  }

  if (req.method === 'GET' && path === '/control/webhooks') {
    return json(res, 200, { webhooks: state.webhooks });
  }

  if (req.method === 'POST' && path === '/control/reset') {
    state.content = 'initial content';
    state.webhooks = [];
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'not found', path });
});

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[harness] listening on http://0.0.0.0:${PORT}`);
});
