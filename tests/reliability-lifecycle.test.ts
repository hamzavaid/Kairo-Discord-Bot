import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import {
  runSelfTest,
  ShutdownCoordinator,
  UiLifecycle,
  executableCheck,
} from '../apps/bot/src/bootstrap/reliability.js';

it('kills a startup executable when its check is canceled', async () => {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
  const signal = new AbortController();
  const pending = executableCheck(
    'fixture',
    ['--version'],
    signal.signal,
    (() => child) as never,
  );
  const failed = expect(pending).rejects.toThrow('Executable check failed');
  signal.abort();
  await failed;
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  child.emit('error', new Error('late failed process'));
});
import { databaseHealth } from '../packages/data/src/health.js';

it('classifies required and optional startup checks without exposing internal failures', async () => {
  const checks = await runSelfTest(
    [
      {
        name: 'mongodb',
        required: true,
        run: async () => {
          throw new Error('mongodb://secret');
        },
      },
      {
        name: 'ffprobe',
        required: false,
        run: async () => {
          throw new Error('private/path');
        },
      },
      { name: 'ffmpeg', required: true, run: async () => {} },
    ],
    100,
  );
  expect(checks.map((c) => c.status)).toEqual(['fatal', 'degraded', 'ok']);
  expect(JSON.stringify(checks)).not.toMatch(/secret|private/);
});
it('times out a hung startup dependency', async () => {
  vi.useFakeTimers();
  try {
    const pending = runSelfTest(
      [{ name: 'yt-dlp', required: true, run: () => new Promise(() => {}) }],
      10,
    );
    await vi.advanceTimersByTimeAsync(11);
    expect((await pending)[0]?.status).toBe('fatal');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('runs shutdown once in order and still destroys Discord/Mongo after failed or stalled steps', async () => {
  vi.useFakeTimers();
  try {
    const calls: string[] = [];
    const close = new ShutdownCoordinator(
      [
        {
          name: 'admission',
          run: () => {
            calls.push('admission');
          },
        },
        {
          name: 'games',
          run: () => {
            calls.push('games');
            return new Promise<void>(() => {});
          },
        },
        {
          name: 'playback',
          run: () => {
            calls.push('playback');
            throw new Error('private');
          },
        },
        {
          name: 'discord',
          run: () => {
            calls.push('discord');
          },
        },
        {
          name: 'mongodb',
          run: () => {
            calls.push('mongodb');
          },
        },
      ],
      100,
      10,
    );
    const first = close.close();
    expect(close.close()).toBe(first);
    await vi.advanceTimersByTimeAsync(25);
    expect((await first).failures).toEqual(['games', 'playback']);
    expect(calls).toEqual([
      'admission',
      'games',
      'playback',
      'discord',
      'mongodb',
    ]);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('stops scoped collectors once and rejects new UI after shutdown', () => {
  const lifecycle = new UiLifecycle();
  const collector = Object.assign(new EventEmitter(), {
    stop: vi.fn(() => collector.emit('end')),
  });
  lifecycle.track(collector);
  lifecycle.close();
  lifecycle.close();
  expect(collector.stop).toHaveBeenCalledTimes(1);
  expect(() => lifecycle.track(collector)).toThrow();
});
it('isolates database health failures and bounds an unresponsive ping', async () => {
  expect(
    await databaseHealth({
      readyState: 1,
      db: {
        admin: () => ({
          ping: async () => {
            throw new Error('secret-uri');
          },
        }),
      },
    } as never),
  ).toEqual({ status: 'unavailable' });
  expect(await databaseHealth({ readyState: 0 } as never)).toEqual({
    status: 'unavailable',
  });
  vi.useFakeTimers();
  try {
    const pending = databaseHealth(
      {
        readyState: 1,
        db: { admin: () => ({ ping: () => new Promise(() => {}) }) },
      } as never,
      10,
    );
    await vi.advanceTimersByTimeAsync(11);
    expect(await pending).toEqual({ status: 'unavailable' });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
