import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { ProcessRegistry } from '../packages/music-engine/src/reliability/ProcessRegistry.js';
import { Metrics } from '@kairo/shared';
import { QueueManager } from '../packages/music-engine/src/queue/QueueManager.js';
import { QueueMutex } from '../packages/music-engine/src/queue/QueueMutex.js';
import { StreamResolver } from '../packages/music-engine/src/stream/StreamResolver.js';
import { FairLimiter } from '@kairo/shared';
import { libraryTrack } from './helpers/libraryModel.js';

it('retains a stream slot until a noncooperative resolver settles and disposes late audio', async () => {
  let finish!: (value: unknown) => void;
  const resolveAudio = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const gate = new FairLimiter(1, 1, 0);
  const resolver = new StreamResolver(
    [{ id: 'fixture', canStream: () => true, resolveAudio } as never],
    { gate },
  );
  const controller = new AbortController();
  const pending = resolver.resolve(libraryTrack, controller.signal);
  const failed = expect(pending).rejects.toMatchObject({
    code: 'STREAM_CANCELLED',
  });
  await vi.waitFor(() => expect(resolveAudio).toHaveBeenCalledTimes(1));
  controller.abort();
  await failed;
  await expect(
    resolver.resolve(libraryTrack, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'RESOURCE_BUSY' });
  const dispose = vi.fn();
  finish({
    kind: 'readable',
    inputType: 'opus',
    input: new PassThrough(),
    sourceProvider: 'fixture',
    seekable: false,
    dispose,
  });
  await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  expect(gate.snapshot().active).toBe(0);
  gate.close();
});

it('bounds retained guild queues without allocating queues for read-only snapshots', async () => {
  const queues = new QueueManager({ maxGuilds: 1 });
  for (let n = 0; n < 100; n++) queues.snapshot(String(n));
  await queues.setRepeat('a', 'off');
  await expect(queues.setRepeat('b', 'off')).rejects.toMatchObject({
    code: 'RESOURCE_BUSY',
  });
});
it('bounds waiting guild mutations and frees capacity after failure', async () => {
  const mutex = new QueueMutex(1);
  let release!: () => void;
  const first = mutex.runExclusive(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await Promise.resolve();
  await expect(mutex.runExclusive(() => {})).rejects.toMatchObject({
    code: 'RESOURCE_BUSY',
  });
  release();
  await first;
  expect(mutex.busy).toBe(false);
  await expect(mutex.runExclusive(() => 1)).resolves.toBe(1);
});

function child() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}
it('waits for native process exit after shutdown and bounds unconfirmed exits', async () => {
  vi.useFakeTimers();
  try {
    const registry = new ProcessRegistry(2);
    const process = Object.assign(child(), { pid: 123 });
    registry.spawn('ffmpeg', 'g', 'ffmpeg', [], (() => process) as never);
    process.emit('spawn');
    registry.close();
    let done = false;
    const pending = registry.drain(20).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    process.emit('close', null);
    await pending;
    expect(process.kill).toHaveBeenCalledTimes(1);
    expect(registry.snapshot().ffmpeg).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('bounds owned FFmpeg processes and reclaims an orphan without touching active playback', () => {
  const registry = new ProcessRegistry(1, new Metrics());
  const first = child();
  registry.spawn('ffmpeg', 'g', 'ffmpeg', [], (() => first) as never);
  expect(() =>
    registry.spawn('ffmpeg', 'b', 'ffmpeg', [], (() => child()) as never),
  ).toThrow(expect.objectContaining({ code: 'RESOURCE_BUSY' }));
  expect(registry.sweep((owner) => owner === 'g')).toBe(0);
  expect(first.kill).not.toHaveBeenCalled();
  expect(registry.sweep(() => false)).toBe(1);
  expect(first.kill).toHaveBeenCalled();
  expect(registry.snapshot().ffmpeg).toBe(0);
});
it('terminates a process that never starts and emits a safe stream failure', async () => {
  vi.useFakeTimers();
  try {
    const registry = new ProcessRegistry(2, new Metrics(), 20);
    const process = child();
    const error = vi.fn();
    process.stdout.on('error', error);
    registry.spawn('ffmpeg', 'g', 'ffmpeg', [], (() => process) as never);
    await vi.advanceTimersByTimeAsync(21);
    expect(process.kill).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FFMPEG_ERROR' }),
    );
    expect(registry.snapshot().ffmpeg).toBe(0);
    registry.close();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('applies global parser backpressure and releases canceled admission', async () => {
  const search = vi.fn(() => new Promise<never>(() => {}));
  const engine = createKairoMusicEngine({
    youtubeSr: { search },
    reliability: { providerConcurrency: 1, providerPerGuild: 1, maxWaiting: 0 },
  });
  const abort = new AbortController();
  const first = engine.parse({
    input: 'one',
    guildId: 'a',
    requestedBy: 'u',
    signal: abort.signal,
  });
  const canceled = expect(first).rejects.toMatchObject({
    code: 'PARSER_CANCELLED',
  });
  await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
  await expect(
    engine.parse({ input: 'two', guildId: 'b', requestedBy: 'u' }),
  ).rejects.toMatchObject({ code: 'RESOURCE_BUSY' });
  abort.abort();
  await canceled;
  await engine.shutdown();
  expect(engine.getHealth().resources.activeVoiceSessions).toBe(0);
});
