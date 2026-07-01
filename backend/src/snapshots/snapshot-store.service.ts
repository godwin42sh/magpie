import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import {
  type ChangeEvent,
  changeEventSchema,
  type Fingerprint,
  type SiteState,
  siteStateSchema,
} from '@magpie/shared';

import { Mutex } from '../common/mutex.js';

/** Maximum number of change events retained per site. */
const HISTORY_CAP = 50;

/**
 * Persists machine-owned snapshot state, one file per site at
 * `state/<siteId>.json` (separate from user intent in config.json so it can
 * live on its own Docker volume).
 *
 * Reads validate against `siteStateSchema`; a missing file yields a fresh
 * empty state. Each site's file is guarded by its own mutex and written
 * atomically (temp file + rename).
 */
@Injectable()
export class SnapshotStore {
  private readonly dir: string;
  private readonly locks = new Map<string, Mutex>();

  constructor() {
    const stateDir = process.env.STATE_PATH ?? './data/state';
    this.dir = resolve(stateDir);
  }

  /** Returns the stored state for a site, or a fresh empty state if none. */
  async get(siteId: string): Promise<SiteState> {
    let raw: string;
    try {
      raw = await readFile(this.fileFor(siteId), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.emptyState(siteId);
      }
      throw err;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return this.emptyState(siteId);
    }
    const parsed: unknown = JSON.parse(trimmed);
    return siteStateSchema.parse(parsed);
  }

  /** Validates and atomically persists a full state object. */
  async save(state: SiteState): Promise<void> {
    const validated = siteStateSchema.parse(state);
    await this.lockFor(validated.siteId).runExclusive(async () => {
      await this.write(validated);
    });
  }

  /**
   * Records a detected change: updates lastHash/lastSnapshot, sets
   * lastChangedAt + lastCheckedAt to now, clears lastError, and prepends a
   * change event (history capped to the most recent {@link HISTORY_CAP}).
   * Returns the created event.
   */
  async recordChange(
    siteId: string,
    args: {
      oldHash: string;
      newHash: string;
      snapshot: string;
      diff?: string;
      preview?: string;
      fingerprint?: Fingerprint;
    },
  ): Promise<ChangeEvent> {
    return this.lockFor(siteId).runExclusive(async () => {
      const state = await this.get(siteId);
      const now = new Date().toISOString();
      const event: ChangeEvent = changeEventSchema.parse({
        id: randomUUID(),
        siteId,
        at: now,
        oldHash: args.oldHash,
        newHash: args.newHash,
        ...(args.diff !== undefined ? { diff: args.diff } : {}),
        ...(args.preview !== undefined ? { preview: args.preview } : {}),
      });
      const next: SiteState = {
        ...state,
        lastHash: args.newHash,
        lastSnapshot: args.snapshot,
        ...(args.fingerprint !== undefined ? { fingerprint: args.fingerprint } : {}),
        lastCheckedAt: now,
        lastChangedAt: now,
        lastError: null,
        history: [event, ...state.history].slice(0, HISTORY_CAP),
      };
      await this.write(siteStateSchema.parse(next));
      return event;
    });
  }

  /** Records a failed check: sets lastError + lastCheckedAt, keeps the rest. */
  async recordError(siteId: string, message: string): Promise<void> {
    await this.lockFor(siteId).runExclusive(async () => {
      const state = await this.get(siteId);
      const next: SiteState = {
        ...state,
        lastError: message,
        lastCheckedAt: new Date().toISOString(),
      };
      await this.write(siteStateSchema.parse(next));
    });
  }

  /**
   * Records a successful no-change check: refreshes lastCheckedAt, clears
   * lastError, and updates the stored hash/snapshot/fingerprint baseline.
   */
  async recordChecked(
    siteId: string,
    args: { hash: string; snapshot: string; fingerprint?: Fingerprint },
  ): Promise<void> {
    await this.lockFor(siteId).runExclusive(async () => {
      const state = await this.get(siteId);
      const next: SiteState = {
        ...state,
        lastHash: args.hash,
        lastSnapshot: args.snapshot,
        ...(args.fingerprint !== undefined ? { fingerprint: args.fingerprint } : {}),
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      };
      await this.write(siteStateSchema.parse(next));
    });
  }

  private emptyState(siteId: string): SiteState {
    return {
      siteId,
      lastHash: null,
      lastSnapshot: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastError: null,
      history: [],
    };
  }

  private fileFor(siteId: string): string {
    return join(this.dir, `${siteId}.json`);
  }

  private lockFor(siteId: string): Mutex {
    let lock = this.locks.get(siteId);
    if (!lock) {
      lock = new Mutex();
      this.locks.set(siteId, lock);
    }
    return lock;
  }

  /** Atomic write (temp file + rename). Callers must hold the site's mutex. */
  private async write(state: SiteState): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const target = this.fileFor(state.siteId);
    const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(tmp, target);
  }
}
