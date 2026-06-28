import { Global, Module } from '@nestjs/common';

import { ConfigStore } from './config-store.service.js';

/**
 * Global module exposing the ConfigStore (user-intent persistence) so any
 * feature module can inject it without re-importing.
 */
@Global()
@Module({
  providers: [ConfigStore],
  exports: [ConfigStore],
})
export class ConfigModule {}
