import { describe, expect, it, vi } from 'vitest';
import {
  FairLimiter,
  WorkScope,
} from '../packages/shared/src/reliability/work.js';

describe('bounded cancellable work', () => {
  it('cancels a noncooperative job and observes late failure without leaking work', async () => {
    const scope = new WorkScope(1000);
    let reject!: (reason: Error) => void;
    const job = scope.run(
      () =>
        new Promise<never>((_, no) => {
          reject = no;
        }),
    );
    await Promise.resolve();
    scope.close();
    await expect(job).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });
    reject(new Error('late'));
    await Promise.resolve();
    expect(scope.active).toBe(0);
    await expect(scope.run(async () => 1)).rejects.toMatchObject({
      code: 'OPERATION_CANCELLED',
    });
  });
  it('times out jobs and clears their deadline timers', async () => {
    vi.useFakeTimers();
    try {
      const scope = new WorkScope(10);
      const job = scope.run(() => new Promise<never>(() => {}));
      const assertion = expect(job).rejects.toMatchObject({
        code: 'OPERATION_TIMEOUT',
      });
      await vi.advanceTimersByTimeAsync(11);
      await assertion;
      expect(scope.active).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('bounds admission and gives waiting guilds round-robin service', async () => {
    const gate = new FairLimiter(1, 1, 3);
    const first = await gate.acquire('a');
    const order: string[] = [];
    const a = gate.acquire('a').then((release) => {
      order.push('a');
      release();
    });
    const b = gate.acquire('b').then((release) => {
      order.push('b');
      release();
    });
    const c = gate.acquire('c').then((release) => {
      order.push('c');
      release();
    });
    await expect(gate.acquire('d')).rejects.toMatchObject({
      code: 'RESOURCE_BUSY',
    });
    first();
    await Promise.all([a, b, c]);
    expect(order).toEqual(['b', 'c', 'a']);
    expect(gate.snapshot()).toMatchObject({ active: 0, waiting: 0 });
  });
  it('removes canceled waiters and rejects all waiters on shutdown', async () => {
    const gate = new FairLimiter(1, 1, 2);
    const release = await gate.acquire('a');
    const abort = new AbortController();
    const waiting = gate.acquire('b', abort.signal);
    abort.abort();
    await expect(waiting).rejects.toMatchObject({
      code: 'OPERATION_CANCELLED',
    });
    const next = gate.acquire('c');
    gate.close();
    await expect(next).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });
    release();
    release();
    expect(gate.snapshot()).toMatchObject({ active: 0, waiting: 0 });
  });
});
