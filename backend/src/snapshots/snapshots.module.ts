import { Global, Module } from '@nestjs/common';

import { SnapshotStore } from './snapshot-store.service.js';

/**
 * Global module exposing the SnapshotStore (machine-owned per-site state).
 */
@Global()
@Module({
  providers: [SnapshotStore],
  exports: [SnapshotStore],
})
export class SnapshotsModule {}
