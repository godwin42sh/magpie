import { NotificationService } from './notification.service.js';

describe('NotificationService.send retry', () => {
  const realFetch = globalThis.fetch;
  const realUrl = process.env.NOTIFY_WEBHOOK_URL;
  const realAttempts = process.env.NOTIFY_RETRY_ATTEMPTS;

  beforeEach(() => {
    process.env.NOTIFY_WEBHOOK_URL = 'https://hook.test/x';
    process.env.NOTIFY_RETRY_ATTEMPTS = '2'; // keep backoff to a single 1s wait
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realUrl === undefined) delete process.env.NOTIFY_WEBHOOK_URL;
    else process.env.NOTIFY_WEBHOOK_URL = realUrl;
    if (realAttempts === undefined) delete process.env.NOTIFY_RETRY_ATTEMPTS;
    else process.env.NOTIFY_RETRY_ATTEMPTS = realAttempts;
  });

  const ok = () => new Response('{}', { status: 200 });
  const fail = (status: number) => new Response('', { status });

  it('retries a transient 5xx and succeeds', async () => {
    const calls: number[] = [];
    globalThis.fetch = (async () => {
      calls.push(1);
      return calls.length === 1 ? fail(500) : ok();
    }) as typeof fetch;

    const result = await new NotificationService().send('hi');
    expect(result).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxAttempts on persistent failure', async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n += 1;
      return fail(503);
    }) as typeof fetch;

    const result = await new NotificationService().send('hi');
    expect(result).toBe(false);
    expect(n).toBe(2);
  });

  it('does NOT retry a non-retryable 4xx', async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n += 1;
      return fail(400);
    }) as typeof fetch;

    const result = await new NotificationService().send('hi');
    expect(result).toBe(false);
    expect(n).toBe(1);
  });
});
