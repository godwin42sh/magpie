import { Global, Module } from '@nestjs/common';

import { NotificationService } from './notification.service.js';

/**
 * Global module exposing the NotificationService (webhook delivery).
 */
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
