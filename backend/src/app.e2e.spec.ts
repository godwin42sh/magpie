import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type CreateSiteRequest } from '@magpie/shared';

import { AppModule } from './app.module.js';
import { FetchService, type FetchResult } from './rendering/fetch.service.js';
import { PlaywrightService } from './rendering/playwright.service.js';
import { FlareSolverrService } from './rendering/flaresolverr.service.js';

/**
 * A controllable fake FetchService: the test sets `nextHtml` and every fetch
 * returns it. This lets us prove deterministic change / no-change behaviour
 * through the real crawl pipeline without any browser or network.
 */
class FakeFetchService {
  nextHtml = '<html><body><div id="zone">A</div></body></html>';
  async fetch(): Promise<FetchResult> {
    return { html: this.nextHtml, finalUrl: 'https://example.com/', usedFlaresolverr: false };
  }
}

const baseSite: CreateSiteRequest = {
  name: 'Example',
  url: 'https://example.com',
  selector: '#zone',
  compareMode: 'innerHTML',
  enabled: false, // keep scheduler quiet during the test
  cron: '*/5 * * * *',
};

describe('Backend e2e', () => {
  let app: INestApplication;
  let fetcher: FakeFetchService;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawl-e2e-'));
    process.env.CONFIG_PATH = join(dir, 'config.json');
    process.env.STATE_PATH = join(dir, 'state');
    delete process.env.NOTIFY_WEBHOOK_URL; // notifications no-op

    fetcher = new FakeFetchService();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // No real browser / network in tests.
      .overrideProvider(FetchService)
      .useValue(fetcher)
      .overrideProvider(PlaywrightService)
      .useValue({
        render: () => Promise.reject(new Error('no browser in tests')),
        onModuleDestroy: () => undefined,
      })
      .overrideProvider(FlareSolverrService)
      .useValue({
        isConfigured: false,
        solve: () => Promise.reject(new Error('no flaresolverr in tests')),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.CONFIG_PATH;
    delete process.env.STATE_PATH;
  });

  it('CRUD happy path', async () => {
    const server = app.getHttpServer();

    // Empty initially.
    await request(server).get('/api/sites').expect(200).expect([]);

    // Create.
    const created = await request(server).post('/api/sites').send(baseSite).expect(201);
    const id: string = created.body.id;
    expect(id).toMatch(/[0-9a-f-]{36}/);
    expect(created.body.name).toBe('Example');

    // Read one.
    await request(server).get(`/api/sites/${id}`).expect(200);

    // Update.
    const updated = await request(server)
      .patch(`/api/sites/${id}`)
      .send({ name: 'Renamed' })
      .expect(200);
    expect(updated.body.name).toBe('Renamed');

    // Toggle enabled.
    const toggled = await request(server)
      .patch(`/api/sites/${id}/enabled`)
      .send({ enabled: true })
      .expect(200);
    expect(toggled.body.enabled).toBe(true);
    // turn back off so the scheduler doesn't run it.
    await request(server).patch(`/api/sites/${id}/enabled`).send({ enabled: false }).expect(200);

    // List has one.
    const list = await request(server).get('/api/sites').expect(200);
    expect(list.body).toHaveLength(1);

    // Delete.
    await request(server).delete(`/api/sites/${id}`).expect(204);
    await request(server).get(`/api/sites/${id}`).expect(404);
  });

  it('rejects invalid create payloads with 400 (Zod)', async () => {
    const server = app.getHttpServer();

    // Missing required fields / bad url / bad cron.
    const bad = await request(server)
      .post('/api/sites')
      .send({ name: '', url: 'not-a-url', selector: '', enabled: true, cron: 'nonsense' })
      .expect(400);
    expect(bad.body.message).toBe('Validation failed');
    expect(bad.body.errors).toBeDefined();
  });

  it('check-now: deterministic change vs no-change through the real pipeline', async () => {
    const server = app.getHttpServer();

    fetcher.nextHtml = '<html><body><div id="zone">A</div></body></html>';
    const created = await request(server)
      .post('/api/sites')
      .send({ ...baseSite, name: 'CheckMe' })
      .expect(201);
    const id: string = created.body.id;

    // 1st check: captures baseline => unchanged.
    const first = await request(server).post(`/api/sites/${id}/check-now`).expect(200);
    expect(first.body.status).toBe('unchanged');

    // 2nd check, same HTML => unchanged.
    const second = await request(server).post(`/api/sites/${id}/check-now`).expect(200);
    expect(second.body.status).toBe('unchanged');
    expect(second.body.hash).toBe(first.body.hash);

    // 3rd check, different content => changed.
    fetcher.nextHtml = '<html><body><div id="zone">B</div></body></html>';
    const third = await request(server).post(`/api/sites/${id}/check-now`).expect(200);
    expect(third.body.status).toBe('changed');
    expect(third.body.hash).not.toBe(first.body.hash);

    // 4th check, same as 3rd => unchanged again.
    const fourth = await request(server).post(`/api/sites/${id}/check-now`).expect(200);
    expect(fourth.body.status).toBe('unchanged');

    // Volatile-attr-only difference must NOT be reported as a change.
    fetcher.nextHtml = '<html><body><div id="zone" nonce="xyz">B</div></body></html>';
    const fifth = await request(server).post(`/api/sites/${id}/check-now`).expect(200);
    expect(fifth.body.status).toBe('unchanged');

    // The change should appear in the events history.
    const events = await request(server).get(`/api/sites/${id}/events`).expect(200);
    expect(events.body.length).toBeGreaterThanOrEqual(1);
    expect(events.body[0].siteId).toBe(id);

    // check-now on an unknown site => 404.
    await request(server)
      .post('/api/sites/00000000-0000-0000-0000-000000000000/check-now')
      .expect(404);
  });
});
