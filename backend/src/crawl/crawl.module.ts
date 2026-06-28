import { Global, Module } from '@nestjs/common';

import { CrawlService } from './crawl.service.js';

/**
 * Global module exposing the CrawlService. Global so both the scheduler and the
 * sites controller (check-now route) can inject it. Its dependencies
 * (ConfigStore, FetchService, SnapshotStore, NotificationService) all come from
 * other global modules.
 */
@Global()
@Module({
  providers: [CrawlService],
  exports: [CrawlService],
})
export class CrawlModule {}
