import { Module } from '@nestjs/common';

import { SitesController } from './sites.controller.js';
import { SitesService } from './sites.service.js';

/**
 * Feature module for site management. ConfigStore, SnapshotStore and
 * NotificationService are provided by global modules, so they are injectable
 * here without explicit imports.
 *
 * SitesService is exported so the scheduler module (backend part 2) can reuse
 * it / wire into its mutation hooks.
 */
@Module({
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
