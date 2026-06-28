import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type CreateSiteRequest,
  type Site,
  siteSchema,
  type UpdateSiteRequest,
} from '@magpie/shared';
import { z } from 'zod';

import { Mutex } from '../common/mutex.js';

const configFileSchema = z.array(siteSchema);

/**
 * Persists user intent — the list of monitored sites — to `config.json`.
 *
 * Reads validate against `siteSchema[]`. Every mutation goes through an
 * in-process async mutex (so concurrent requests cannot interleave a
 * read-modify-write) and is committed with an atomic write (write to a temp
 * file in the same directory, then rename over the target).
 *
 * This is deliberately separate from machine-owned snapshot state
 * (SnapshotStore / state/<siteId>.json).
 */
@Injectable()
export class ConfigStore {
  private readonly logger = new Logger(ConfigStore.name);
  private readonly mutex = new Mutex();
  private readonly path: string;

  constructor() {
    this.path = resolve(process.env.CONFIG_PATH ?? './data/config.json');
  }

  /** Returns all configured sites. Missing/empty config reads as `[]`. */
  async list(): Promise<Site[]> {
    return this.read();
  }

  /** Returns a single site or throws 404. */
  async get(id: string): Promise<Site> {
    const sites = await this.read();
    const site = sites.find((s) => s.id === id);
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return site;
  }

  /** Creates a site, assigning id + timestamps. Returns the created site. */
  async create(input: CreateSiteRequest): Promise<Site> {
    return this.mutex.runExclusive(async () => {
      const sites = await this.read();
      const now = new Date().toISOString();
      const site = siteSchema.parse({
        ...input,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
      sites.push(site);
      await this.write(sites);
      return site;
    });
  }

  /** Applies a partial update, bumping `updatedAt`. Throws 404 if absent. */
  async update(id: string, patch: UpdateSiteRequest): Promise<Site> {
    return this.mutex.runExclusive(async () => {
      const sites = await this.read();
      const index = sites.findIndex((s) => s.id === id);
      if (index === -1) {
        throw new NotFoundException(`Site ${id} not found`);
      }
      const current = sites[index]!;
      const next = siteSchema.parse({
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      });
      sites[index] = next;
      await this.write(sites);
      return next;
    });
  }

  /** Removes a site. Throws 404 if absent. */
  async remove(id: string): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const sites = await this.read();
      const index = sites.findIndex((s) => s.id === id);
      if (index === -1) {
        throw new NotFoundException(`Site ${id} not found`);
      }
      sites.splice(index, 1);
      await this.write(sites);
    });
  }

  /** Toggles a site's `enabled` flag. Returns the updated site. */
  async setEnabled(id: string, enabled: boolean): Promise<Site> {
    return this.update(id, { enabled });
  }

  /**
   * Reads and validates the config file. A missing file is treated as an empty
   * list (first run); malformed JSON or schema violations throw.
   */
  private async read(): Promise<Site[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const parsed: unknown = JSON.parse(trimmed);
    return configFileSchema.parse(parsed);
  }

  /**
   * Atomically writes the config: serialize, write to a unique temp file in the
   * same directory, then rename over the target (rename is atomic on the same
   * filesystem). Callers must already hold the mutex.
   */
  private async write(sites: Site[]): Promise<void> {
    const dir = dirname(this.path);
    await mkdir(dir, { recursive: true });
    const tmp = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    const json = `${JSON.stringify(sites, null, 2)}\n`;
    await writeFile(tmp, json, 'utf8');
    try {
      await rename(tmp, this.path);
    } catch (err) {
      this.logger.error(`Atomic rename failed for ${this.path}: ${String(err)}`);
      throw err;
    }
  }
}
