import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { PlaybackSession } from '../packages/music-engine/src/playback/PlaybackSession.js';
import { ProcessRegistry } from '../packages/music-engine/src/reliability/ProcessRegistry.js';
import { libraryTrack } from './helpers/libraryModel.js';
import { FFmpegPipeline } from '../packages/music-engine/src/stream/FFmpegPipeline.js';

it('terminates FFmpeg even when upstream disposal throws', () => {
  const process = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  const pipeline = new FFmpegPipeline({ spawn: (() => process) as never });
  const prepared = pipeline.prepare({
    kind: 'readable',
    input: new PassThrough(),
    inputType: 'arbitrary',
    sourceProvider: 'fixture',
    seekable: false,
    dispose: () => {
      throw new Error('broken upstream');
    },
  });
  expect(() => prepared.dispose()).not.toThrow();
  prepared.dispose();
  expect(process.kill).toHaveBeenCalledTimes(1);
});

it('watchdog fails a stalled resolver once and disposes late audio without playing it', async () => {
  let finish!: (value: unknown) => void;
  let signal!: AbortSignal;
  const player = Object.assign(new EventEmitter(), {
    play: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    unpause: vi.fn(),
  });
  const onEnded = vi.fn();
  const prepare = vi.fn();
  const session = new PlaybackSession({
    guildId: 'g',
    player: player as never,
    resolver: {
      resolve: (_track: unknown, active: AbortSignal) => {
        signal = active;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    } as never,
    prepare,
    onEnded,
  });
  session.attach({ subscribe: () => ({ unsubscribe: vi.fn() }) } as never);
  session.start(
    {
      id: 'entry',
      track: libraryTrack,
      enqueuedBy: 'u',
      enqueuedAt: new Date(),
    },
    1,
  );
  expect(session.watchdog(Date.now() + 100, 10)).toBe(true);
  expect(session.watchdog(Date.now() + 200, 10)).toBe(false);
  expect(signal.aborted).toBe(true);
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
  expect(onEnded).toHaveBeenCalledTimes(1);
  expect(player.play).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
  session.disconnect();
});
it('turns FFmpeg crashes into safe stream failures and releases process ownership', async () => {
  const process = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  const registry = new ProcessRegistry();
  const error = vi.fn();
  process.stdout.on('error', error);
  registry.spawn('ffmpeg', 'g', 'ffmpeg', [], (() => process) as never);
  process.emit('spawn');
  process.emit('exit', 1);
  process.emit('close', 1);
  await vi.waitFor(() =>
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FFMPEG_ERROR' }),
    ),
  );
  expect(registry.snapshot().ffmpeg).toBe(0);
  registry.close();
  await registry.drain();
});
it('reports an unconfirmed process exit within the cleanup deadline', async () => {
  vi.useFakeTimers();
  try {
    const process = Object.assign(new EventEmitter(), {
      pid: 123,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    const registry = new ProcessRegistry();
    registry.spawn('ffmpeg', 'g', 'ffmpeg', [], (() => process) as never);
    registry.close();
    const failed = expect(registry.drain(10)).rejects.toMatchObject({
      code: 'FFMPEG_ERROR',
    });
    await vi.advanceTimersByTimeAsync(11);
    await failed;
    expect(process.kill).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    process.emit('close', null);
  } finally {
    vi.useRealTimers();
  }
});
