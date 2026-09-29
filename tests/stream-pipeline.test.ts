import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { StreamResolver } from '../packages/music-engine/src/stream/StreamResolver.js';
import { FixtureStreamProvider } from '../packages/music-engine/src/stream/FixtureStreamProvider.js';
import { AudioProbe } from '../packages/music-engine/src/stream/AudioProbe.js';
import { FFmpegPipeline } from '../packages/music-engine/src/stream/FFmpegPipeline.js';
import type { Track } from '@kairo/music-engine';

const track: Track = {
  id: 'fixture:tone',
  sourceId: 'tone',
  sourceProvider: 'fixture',
  title: 'Tone',
  artists: [{ name: 'Fixture' }],
  isLive: false,
  requestedBy: 'user',
  provenance: { input: 'tone', parsedBy: 'fixture' },
  createdAt: new Date(),
};

describe('Phase 5 stream pipeline', () => {
  it('resolves configured Opus fixture packets and bypasses FFmpeg', async () => {
    const provider = new FixtureStreamProvider({
      tone: { packets: [Uint8Array.from([0xf8, 0xff, 0xfe])] },
    });
    const source = await new StreamResolver([provider]).resolve(
      track,
      new AbortController().signal,
    );
    expect(source).toMatchObject({
      kind: 'readable',
      inputType: 'opus',
      sourceProvider: 'fixture',
    });
    expect(new AudioProbe().inspect(source).needsTranscode).toBe(false);
    expect(
      new AudioProbe().inspect({
        kind: 'file',
        input: 'tone.opus',
        inputType: 'opus',
        sourceProvider: 'fixture',
        seekable: true,
      }).needsTranscode,
    ).toBe(true);
  });

  it('rejects unavailable sources and honors cancellation', async () => {
    const resolver = new StreamResolver([]);
    await expect(
      resolver.resolve(track, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'STREAM_UNAVAILABLE' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      new StreamResolver([
        new FixtureStreamProvider({
          tone: { packets: [Uint8Array.from([1])] },
        }),
      ]).resolve(track, controller.signal),
    ).rejects.toMatchObject({ code: 'STREAM_CANCELLED' });
  });

  it('times out a stalled stream provider and aborts its request', async () => {
    let observed: AbortSignal | undefined;
    const provider = {
      id: 'slow',
      canStream: () => true,
      resolveAudio: (_track: Track, signal: AbortSignal) => {
        observed = signal;
        return new Promise<never>(() => {});
      },
    };
    await expect(
      new StreamResolver([provider], { timeoutMs: 10 }).resolve(
        track,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'STREAM_TIMEOUT' });
    expect(observed?.aborted).toBe(true);
  });

  it('spawns FFmpeg with argument arrays and terminates it during cleanup', () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
      stdout: new Readable({ read() {} }),
      stderr: new Readable({ read() {} }),
      kill: vi.fn(() => true),
    });
    const spawn = vi.fn(() => child as never);
    const pipeline = new FFmpegPipeline({ executable: 'ffmpeg', spawn });
    const prepared = pipeline.prepare({
      kind: 'file',
      input: 'C:/fixtures/tone.wav',
      inputType: 'arbitrary',
      sourceProvider: 'fixture',
      seekable: false,
    });
    expect(spawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', 'C:/fixtures/tone.wav']),
      expect.objectContaining({ shell: false }),
    );
    prepared.dispose();
    prepared.dispose();
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('cleans up FFmpeg after a child process error', () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
      stdout: new Readable({ read() {} }),
      stderr: new Readable({ read() {} }),
      kill: vi.fn(() => true),
    });
    const pipeline = new FFmpegPipeline({ spawn: (() => child) as never });
    pipeline.prepare({
      kind: 'file',
      input: 'C:/fixtures/tone.wav',
      inputType: 'arbitrary',
      sourceProvider: 'fixture',
      seekable: false,
    });
    expect(() => child.emit('error', new Error('private path'))).not.toThrow();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('passes the guild quality context to the selected stream provider', async () => {
    const provider = {
      id: 'quality',
      canStream: () => true,
      resolveAudio: vi.fn(async () => ({
        kind: 'readable' as const,
        input: Readable.from([]),
        inputType: 'webm/opus' as const,
        sourceProvider: 'quality',
        seekable: false,
      })),
    };
    await new StreamResolver([provider]).resolve(
      track,
      new AbortController().signal,
      { guildId: 'guild', audioQuality: 'low' },
    );
    expect(provider.resolveAudio).toHaveBeenCalledWith(
      track,
      expect.any(AbortSignal),
      { guildId: 'guild', audioQuality: 'low' },
    );
  });

  it('disposes a source that arrives after resolution was cancelled', async () => {
    let finish!: (value: ReturnType<typeof source>) => void;
    const source = () => ({
      kind: 'readable' as const,
      input: Readable.from([]),
      inputType: 'webm/opus' as const,
      sourceProvider: 'late',
      seekable: false,
      dispose: vi.fn(),
    });
    const provider = {
      id: 'late',
      canStream: () => true,
      resolveAudio: () =>
        new Promise<ReturnType<typeof source>>((resolve) => {
          finish = resolve;
        }),
    };
    const controller = new AbortController();
    const pending = new StreamResolver([provider]).resolve(
      track,
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'STREAM_CANCELLED' });
    const late = source();
    finish(late);
    await Promise.resolve();
    expect(late.dispose).toHaveBeenCalledOnce();
  });

  it('disposes an acquired media process if FFmpeg cannot start', () => {
    const dispose = vi.fn();
    const pipeline = new FFmpegPipeline({
      spawn: (() => {
        throw new Error('missing ffmpeg');
      }) as never,
    });
    expect(() =>
      pipeline.prepare({
        kind: 'readable',
        input: Readable.from([]),
        inputType: 'arbitrary',
        sourceProvider: 'yt-dlp',
        seekable: false,
        dispose,
      }),
    ).toThrow();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('terminates FFmpeg and the upstream source when yt-dlp input fails', () => {
    const upstream = new Readable({ read() {} });
    const upstreamDispose = vi.fn();
    const ffmpeg = Object.assign(new EventEmitter(), {
      stdin: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
      stdout: new Readable({ read() {} }),
      stderr: new Readable({ read() {} }),
      kill: vi.fn(() => true),
    });
    const pipeline = new FFmpegPipeline({ spawn: (() => ffmpeg) as never });
    const prepared = pipeline.prepare({
      kind: 'readable',
      input: upstream,
      inputType: 'arbitrary',
      sourceProvider: 'yt-dlp',
      seekable: false,
      dispose: upstreamDispose,
    });
    prepared.input.on('error', () => {});
    upstream.emit('error', new Error('private media URL'));
    expect(upstreamDispose).toHaveBeenCalledOnce();
    expect(ffmpeg.kill).toHaveBeenCalledOnce();
  });
});
