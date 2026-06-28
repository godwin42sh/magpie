import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { ConfigModule } from './config/config.module.js';
import { CrawlModule } from './crawl/crawl.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ProxyModule } from './proxy/proxy.module.js';
import { RenderingModule } from './rendering/rendering.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { SitesModule } from './sites/sites.module.js';
import { SnapshotsModule } from './snapshots/snapshots.module.js';

/**
 * Root module.
 *
 * ScheduleModule.forRoot() enables @nestjs/schedule's dynamic cron registry,
 * which the scheduler module (backend part 2) will use to register per-site
 * jobs via SchedulerRegistry.
 *
 * ConfigModule / SnapshotsModule / NotificationsModule are @Global, exposing
 * their stores/services app-wide.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    SnapshotsModule,
    NotificationsModule,
    RenderingModule,
    CrawlModule,
    SchedulerModule,
    ProxyModule,
    SitesModule,
  ],
})
export class AppModule {}
