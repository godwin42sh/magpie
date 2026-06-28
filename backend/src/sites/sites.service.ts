import { Injectable, Logger } from '@nestjs/common';
import {
  type ChangeEvent,
  type CreateSiteRequest,
  type Site,
  type UpdateSiteRequest,
} from '@magpie/shared';

import { ConfigStore } from '../config/config-store.service.js';
import { CrawlService, type CrawlRunResult } from '../crawl/crawl.service.js';
import { CrawlSchedulerService } from '../scheduler/crawl-scheduler.service.js';
import { SnapshotStore } from '../snapshots/snapshot-store.service.js';

/**
 * Application service for managing monitored sites.
 *
 * Owns id/timestamp generation (delegated to ConfigStore) and exposes change
 * history from the SnapshotStore. Mutating operations keep the cron schedule in
 * sync via CrawlSchedulerService.
 */
@Injectable()
export class SitesService {
  private readonly logger = new Logger(SitesService.name);

  constructor(
    private readonly config: ConfigStore,
    private readonly snapshots: SnapshotStore,
    private readonly scheduler: CrawlSchedulerService,
    private readonly crawl: CrawlService,
  ) {}

  list(): Promise<Site[]> {
    return this.config.list();
  }

  get(id: string): Promise<Site> {
    return this.config.get(id);
  }

  async create(input: CreateSiteRequest): Promise<Site> {
    const site = await this.config.create(input);
    // Register a cron job if the new site is enabled.
    this.scheduler.sync(site);
    this.logger.log(`Created site ${site.id} (${site.name})`);
    return site;
  }

  async update(id: string, patch: UpdateSiteRequest): Promise<Site> {
    const site = await this.config.update(id, patch);
    // Reconcile the job: cron and/or enabled may have changed.
    this.scheduler.sync(site);
    this.logger.log(`Updated site ${site.id}`);
    return site;
  }

  async remove(id: string): Promise<void> {
    await this.config.remove(id);
    // Cancel any registered job for this site.
    this.scheduler.removeJob(id);
    this.logger.log(`Removed site ${id}`);
  }

  async setEnabled(id: string, enabled: boolean): Promise<Site> {
    const site = await this.config.setEnabled(id, enabled);
    // Register/unregister the job to match the new enabled state.
    this.scheduler.sync(site);
    this.logger.log(`Set site ${id} enabled=${enabled}`);
    return site;
  }

  /** Manually triggers a crawl for a site (used by the check-now route). */
  async checkNow(id: string): Promise<CrawlRunResult> {
    // Validates existence (throws 404 if the site is unknown).
    await this.config.get(id);
    return this.crawl.run(id);
  }

  /** Returns the recorded change events for a site (most recent first). */
  async events(id: string): Promise<ChangeEvent[]> {
    // Validates existence (throws 404 if the site is unknown).
    await this.config.get(id);
    const state = await this.snapshots.get(id);
    return state.history;
  }
}
