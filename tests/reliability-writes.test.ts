import { expect, it, vi } from 'vitest';
import { WriteQueue } from '../packages/shared/src/reliability/WriteQueue.js';
import { HistoryService } from '../apps/bot/src/services/HistoryService.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';

it('bounds optional writes and preserves admitted ordering across a database failure', async () => {
  let release!: () => void;
  const failures = vi.fn();
  const queue = new WriteQueue(2, 100, failures);
  const calls: number[] = [];
  queue.add(async () => {
    calls.push(1);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  queue.add(async () => {
    calls.push(2);
    throw new Error('private database payload');
  });
  expect(
    queue.add(async () => {
      calls.push(3);
    }),
  ).toBe(false);
  await vi.waitFor(() => expect(calls).toEqual([1]));
  release();
  await queue.drain();
  expect(calls).toEqual([1, 2]);
  expect(failures).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(failures.mock.calls)).not.toContain('private');
});
it('times out hung writes without allowing unbounded orphan database requests', async () => {
  vi.useFakeTimers();
  try {
    const queue = new WriteQueue(2, 10);
    const write = vi.fn(() => new Promise<void>(() => {}));
    queue.add(write);
    queue.add(write);
    const drain = queue.drain();
    await vi.advanceTimersByTimeAsync(25);
    await drain;
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.add(write)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('bounds shutdown drain and drops queued optional writes after the deadline', async () => {
  vi.useFakeTimers();
  try {
    const queue = new WriteQueue(2, 1000);
    const write = vi.fn(() => new Promise<void>(() => {}));
    queue.add(write);
    queue.add(write);
    const closing = queue.close(10);
    await vi.advanceTimersByTimeAsync(11);
    await closing;
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.add(write)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('history failure cannot reject an engine event and audits retain safe local fallback', async () => {
  let listener!: (event: unknown) => void;
  const history = new HistoryService(
    {
      record: async () => {
        throw new Error('database unavailable');
      },
    } as never,
    () => {
      throw new Error('logger failure');
    },
  );
  history.attach({
    on: (_: string, callback: typeof listener) => {
      listener = callback;
      return () => {};
    },
  } as never);
  expect(() => listener({})).not.toThrow();
  await history.close();
  const audit = new AuditLog(10, {
    record: async () => {
      throw new Error('database unavailable');
    },
    list: async () => {
      throw new Error('database unavailable');
    },
  } as never);
  audit.record({
    command: 'play',
    userId: 'u',
    timestamp: new Date().toISOString(),
    success: true,
    durationMs: 1,
  });
  await audit.drain();
  expect((await audit.persistedList())[0]?.command).toBe('play');
});
