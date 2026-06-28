import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { type Site } from '@magpie/shared';

import { ConfigStore } from '../config/config-store.service.js';
import { CrawlService } from '../crawl/crawl.service.js';

/** Prefix for the dynamic cron job names registered in SchedulerRegistry. */
const JOB_PREFIX = 'crawl:';

/**
 * Keeps a CronJob registered for every enabled site, in sync with user intent.
 *
 * - `onApplicationBootstrap` seeds a job per enabled site.
 * - SitesService calls `sync`/`remove` on create/update/enable/disable/delete.
 * - Each tick calls `CrawlService.run(site.id)` (the crawl service has its own
 *   overlap guard, so a long run never stacks).
 *
 * Jobs live in Nest's SchedulerRegistry so they appear alongside any other
 * scheduled work and are torn down cleanly on shutdown.
 */
@Injectable()
export class CrawlSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CrawlSchedulerService.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly config: ConfigStore,
    private readonly crawl: CrawlService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const sites = await this.config.list();
    let count = 0;
    for (const site of sites) {
      if (site.enabled) {
        this.addJob(site);
        count += 1;
      }
    }
    this.logger.log(`Scheduled ${count} enabled site(s)`);
  }

  onModuleDestroy(): void {
    // Stop and drop every job we own so timers don't leak on shutdown/HMR.
    for (const [name, job] of this.registry.getCronJobs()) {
      if (name.startsWith(JOB_PREFIX)) {
        job.stop();
        this.registry.deleteCronJob(name);
      }
    }
  }

  /**
   * Reconciles the job for a site against its current state: ensures a job
   * exists with the right cron when enabled, and removes it when disabled.
   * Safe to call on create, update, enable, and disable.
   */
  sync(site: Site): void {
    if (site.enabled) {
      this.updateJob(site);
    } else {
      this.removeJob(site.id);
    }
  }

  /** Adds a cron job for a site (no-op-safe: replaces any existing one). */
  addJob(site: Site): void {
    const name = this.jobName(site.id);
    if (this.registry.doesExist('cron', name)) {
      this.removeJob(site.id);
    }
    const job = new CronJob(
      site.cron,
      () => {
        void this.crawl.run(site.id).catch((err: unknown) => {
          this.logger.error(`Crawl tick failed for ${site.id}: ${String(err)}`);
        });
      },
      null,
      false,
    );
    this.registry.addCronJob(name, job);
    job.start();
    this.logger.log(`Added cron job for ${site.id} (${site.cron})`);
  }

  /** Recreates a site's job (delete + add) to apply a new cron/enabled state. */
  updateJob(site: Site): void {
    this.removeJob(site.id);
    this.addJob(site);
  }

  /** Removes a site's job if present. */
  removeJob(siteId: string): void {
    const name = this.jobName(siteId);
    if (!this.registry.doesExist('cron', name)) {
      return;
    }
    const job = this.registry.getCronJob(name);
    job.stop();
    this.registry.deleteCronJob(name);
    this.logger.log(`Removed cron job for ${siteId}`);
  }

  private jobName(siteId: string): string {
    return `${JOB_PREFIX}${siteId}`;
  }
}
