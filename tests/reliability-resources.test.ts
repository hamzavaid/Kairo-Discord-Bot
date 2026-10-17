import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { ProcessRegistry } from '../packages/music-engine/src/reliability/ProcessRegistry.js';
import { Metrics } from '@kairo/shared';

function child() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}
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
