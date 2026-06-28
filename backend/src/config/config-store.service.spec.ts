import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NotFoundException } from '@nestjs/common';
import { type CreateSiteRequest } from '@magpie/shared';

import { ConfigStore } from './config-store.service.js';

const baseSite: CreateSiteRequest = {
  name: 'Example',
  url: 'https://example.com',
  selector: '#main',
  compareMode: 'innerHTML',
  enabled: true,
  cron: '*/5 * * * *',
};

describe('ConfigStore', () => {
  let dir: string;
  let configPath: string;
  let store: ConfigStore;
  const originalEnv = process.env.CONFIG_PATH;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawl-config-'));
    configPath = join(dir, 'config.json');
    process.env.CONFIG_PATH = configPath;
    store = new ConfigStore();
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.CONFIG_PATH;
    } else {
      process.env.CONFIG_PATH = originalEnv;
    }
    await rm(dir, { recursive: true, force: true });
  });

  it('reads an empty list when the file does not exist', async () => {
    await expect(store.list()).resolves.toEqual([]);
  });

  it('creates a site with generated id and timestamps', async () => {
    const site = await store.create(baseSite);
    expect(site.id).toMatch(/[0-9a-f-]{36}/);
    expect(site.createdAt).toEqual(site.updatedAt);
    expect(site.name).toBe('Example');

    const onDisk: unknown = JSON.parse(await readFile(configPath, 'utf8'));
    expect(onDisk).toHaveLength(1);
  });

  it('updates a site and bumps updatedAt while preserving createdAt/id', async () => {
    const created = await store.create(baseSite);
    // Ensure the clock advances.
    await new Promise((r) => setTimeout(r, 5));
    const updated = await store.update(created.id, { name: 'Renamed' });
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.name).toBe('Renamed');
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('toggles enabled via setEnabled', async () => {
    const created = await store.create(baseSite);
    const off = await store.setEnabled(created.id, false);
    expect(off.enabled).toBe(false);
  });

  it('throws NotFoundException for missing ids', async () => {
    await expect(store.get('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      store.update('00000000-0000-0000-0000-000000000000', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(store.remove('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes a site', async () => {
    const created = await store.create(baseSite);
    await store.remove(created.id);
    await expect(store.list()).resolves.toEqual([]);
  });

  it('serializes concurrent creates via the mutex (no lost writes)', async () => {
    const COUNT = 25;
    await Promise.all(
      Array.from({ length: COUNT }, (_, i) => store.create({ ...baseSite, name: `Site ${i}` })),
    );
    const sites = await store.list();
    expect(sites).toHaveLength(COUNT);
    // All names present => no read-modify-write interleaving clobbered an entry.
    const names = new Set(sites.map((s) => s.name));
    expect(names.size).toBe(COUNT);
  });

  it('leaves no temp files after writes (atomic rename)', async () => {
    await store.create(baseSite);
    await store.create({ ...baseSite, name: 'Second' });
    const entries = await readdir(dir);
    expect(entries.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
    expect(entries).toContain('config.json');
  });

  it('rejects a config file that violates siteSchema on read', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(configPath, JSON.stringify([{ name: 'broken' }]), 'utf8');
    await expect(store.list()).rejects.toBeDefined();
  });
});
