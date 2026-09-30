import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  YtDlpStreamProvider,
  selectAudioFormat,
} from '../packages/music-engine/src/stream/YtDlpStreamProvider.js';
import { AudioProbe } from '../packages/music-engine/src/stream/AudioProbe.js';
import { FFmpegPipeline } from '../packages/music-engine/src/stream/FFmpegPipeline.js';
import type { Track } from '@kairo/music-engine';

const formats = [
  {
    format_id: 'opus-48',
    ext: 'webm',
    acodec: 'opus',
    vcodec: 'none',
    abr: 48,
  },
  {
    format_id: 'opus-96',
    ext: 'webm',
    acodec: 'opus',
    vcodec: 'none',
    abr: 96,
  },
  {
    format_id: 'opus-160',
    ext: 'webm',
    acodec: 'opus',
    vcodec: 'none',
    abr: 160,
  },
  {
    format_id: 'aac-256',
    ext: 'm4a',
    acodec: 'mp4a.40.2',
    vcodec: 'none',
    abr: 256,
  },
  {
    format_id: 'video',
    ext: 'mp4',
    acodec: 'mp4a.40.2',
    vcodec: 'avc1',
    abr: 400,
  },
];
const track: Track = {
  id: 'youtube-sr:dQw4w9WgXcQ',
  sourceId: 'dQw4w9WgXcQ',
  sourceProvider: 'youtube-sr',
  title: 'Song',
  artists: [{ name: 'Artist' }],
  isLive: false,
  requestedBy: 'user',
  provenance: { input: 'Song', parsedBy: 'youtube-sr' },
  createdAt: new Date(),
};

function child() {
  const process = Object.assign(new EventEmitter(), {
    stdin: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    stdout: new Readable({ read() {} }),
    stderr: new Readable({ read() {} }),
    kill: vi.fn(() => true),
  });
  return process;
}

describe('yt-dlp audio stream provider', () => {
  it.each([
    ['low', 'opus-48'],
    ['medium', 'opus-96'],
    ['high', 'opus-160'],
    ['best', 'aac-256'],
  ] as const)('selects %s quality within its policy', (quality, id) => {
    expect(selectAudioFormat(formats, quality).formatId).toBe(id);
  });

  it('prefers native WebM Opus near the highest permitted bitrate', () => {
    expect(
      selectAudioFormat(
        [
          {
            format_id: 'aac-170',
            ext: 'm4a',
            acodec: 'mp4a',
            vcodec: 'none',
            abr: 170,
          },
          formats[2]!,
        ],
        'high',
      ).formatId,
    ).toBe('opus-160');
  });

  it('returns a normalized source, uses safe argv, and cancels the media process', async () => {
    const inspect = child();
    const media = child();
    const spawn = vi.fn((_exe: string, args: string[], _options: unknown) => {
      void _options;
      const current = args.includes('--dump-single-json') ? inspect : media;
      queueMicrotask(() => {
        current.emit('spawn');
        if (current === inspect) {
          inspect.stdout.emit(
            'data',
            Buffer.from(
              JSON.stringify({
                formats: [
                  ...formats,
                  {
                    format_id: 'storyboard',
                    ext: 'mhtml',
                    acodec: null,
                    vcodec: 'none',
                    abr: 0,
                  },
                ],
              }),
            ),
          );
          inspect.emit('close', 0);
        }
      });
      return current as never;
    });
    const provider = new YtDlpStreamProvider({
      spawn: spawn as never,
      executable: 'yt-dlp-test',
    });
    const controller = new AbortController();
    const source = await provider.resolveAudio(track, controller.signal, {
      guildId: 'guild',
      audioQuality: 'high',
    });
    expect(source).toMatchObject({
      kind: 'readable',
      inputType: 'webm/opus',
      sourceProvider: 'yt-dlp',
      audioQuality: 'high',
    });
    expect(new AudioProbe().inspect(source).needsTranscode).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['--format', 'opus-160', '--output', '-']),
    );
    expect(spawn.mock.calls[1]?.[1].at(-1)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(spawn.mock.calls[1]?.[2]).toMatchObject({ shell: false });
    controller.abort();
    source.dispose?.();
    expect(media.kill).toHaveBeenCalledTimes(1);
  });

  it('accepts ordinary video metadata larger than one MiB while retaining a size bound', async () => {
    const payload = Buffer.from(
      JSON.stringify({ formats, description: 'x'.repeat(1_300_000) }),
    );
    expect(payload.length).toBeGreaterThan(1_048_576);
    const spawn = vi.fn((_exe: string, args: string[]) => {
      const process = child();
      if (args.includes('--dump-single-json'))
        queueMicrotask(() => {
          process.stdout.emit('data', payload);
          process.emit('close', 0);
        });
      return process as never;
    });
    const provider = new YtDlpStreamProvider({ spawn: spawn as never });
    const source = await provider.resolveAudio(
      track,
      new AbortController().signal,
    );
    expect(source.inputType).toBe('webm/opus');
    source.dispose?.();

    const bounded = new YtDlpStreamProvider({
      spawn: spawn as never,
      maxMetadataBytes: 1_000_000,
    });
    await expect(
      bounded.resolveAudio(track, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'STREAM_UNAVAILABLE' });
  });

  it('kills inspection on cancellation and rejects malformed IDs', async () => {
    const inspect = child();
    const spawn = vi.fn(() => inspect as never);
    const provider = new YtDlpStreamProvider({ spawn: spawn as never });
    const controller = new AbortController();
    const pending = provider.resolveAudio(track, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'STREAM_CANCELLED' });
    expect(inspect.kill).toHaveBeenCalledOnce();
    await expect(
      provider.resolveAudio(
        { ...track, sourceId: 'bad' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'STREAM_UNAVAILABLE' });
    expect(spawn).toHaveBeenCalledOnce();
  });

  it('disposes the upstream yt-dlp source when FFmpeg preparation is disposed', () => {
    const dispose = vi.fn();
    const ffmpeg = child();
    const pipeline = new FFmpegPipeline({ spawn: (() => ffmpeg) as never });
    const prepared = pipeline.prepare({
      kind: 'readable',
      input: new Readable({ read() {} }),
      inputType: 'arbitrary',
      sourceProvider: 'yt-dlp',
      seekable: false,
      dispose,
    });
    prepared.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(ffmpeg.kill).toHaveBeenCalledOnce();
  });

  it('maps unavailable formats to a typed failure without exposing extractor output', async () => {
    const inspect = child();
    const provider = new YtDlpStreamProvider({
      spawn: (() => {
        queueMicrotask(() => inspect.emit('close', 1));
        return inspect as never;
      }) as never,
    });
    await expect(
      provider.resolveAudio(track, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'STREAM_UNAVAILABLE' });
    expect(inspect.kill).toHaveBeenCalledOnce();
  });
});
