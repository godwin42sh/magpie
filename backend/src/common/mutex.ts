/**
 * A minimal FIFO async mutex.
 *
 * `runExclusive` serializes async callbacks: each waits for the previous one to
 * settle before running. Used to make config.json read-modify-write sequences
 * atomic within the process (the OS-level atomicity is handled separately by
 * temp-file + rename).
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    // Chain onto the current tail; swallow the predecessor's result/rejection
    // so one caller's failure does not poison the queue.
    const run = this.tail.then(
      () => fn(),
      () => fn(),
    );
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
