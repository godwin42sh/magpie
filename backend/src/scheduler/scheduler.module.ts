import { Global, Module } from '@nestjs/common';

import { CrawlSchedulerService } from './crawl-scheduler.service.js';

/**
 * Global module exposing the CrawlSchedulerService so SitesService can keep
 * cron jobs in sync on mutations. Depends on SchedulerRegistry (from
 * ScheduleModule.forRoot() in AppModule), ConfigStore, and CrawlService — all
 * global.
 */
@Global()
@Module({
  providers: [CrawlSchedulerService],
  exports: [CrawlSchedulerService],
})
export class SchedulerModule {}
