import { Module } from '@nestjs/common';

import { ProxyController } from './proxy.controller.js';

/**
 * Feature module for the zone-picker render proxy. FetchService is provided by
 * the global RenderingModule, so no explicit imports are needed.
 */
@Module({
  controllers: [ProxyController],
})
export class ProxyModule {}
