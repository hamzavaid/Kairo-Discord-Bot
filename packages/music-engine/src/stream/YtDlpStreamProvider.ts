import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { z } from 'zod';
import { MusicError } from '../api/errors.js';
import type { Track } from '../domain/Track.js';
import type { AudioSource } from './AudioSource.js';
import type { AudioQuality, StreamContext } from './AudioQuality.js';
import { DEFAULT_AUDIO_QUALITY } from './AudioQuality.js';
import type { StreamProvider } from './StreamProvider.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;
const FORMAT_ID = /^[A-Za-z0-9._-]{1,100}$/u;
const inspectionSchema = z.object({
  formats: z
    .array(
      z.object({
        format_id: z.string(),
        ext: z.string().nullable().optional(),
        acodec: z.string().nullable().optional(),
        vcodec: z.string().nullable().optional(),
        abr: z.number().nonnegative().nullable().optional(),
        has_drm: z.boolean().optional(),
      }),
    )
    .max(500),
});
type AudioFormat = z.infer<typeof inspectionSchema>['formats'][number];

const bitrateLimit: Record<AudioQuality, number> = {
  low: 64,
  medium: 128,
  high: 192,
  best: Number.POSITIVE_INFINITY,
};

export function selectAudioFormat(
  formats: readonly AudioFormat[],
  quality: AudioQuality,
): { formatId: string; inputType: 'webm/opus' | 'arbitrary' } {
  const eligible = formats.filter(
    (format) =>
      FORMAT_ID.test(format.format_id) &&
      format.vcodec === 'none' &&
      Boolean(format.acodec && format.acodec !== 'none') &&
      !format.has_drm &&
      (quality === 'best' ||
        (format.abr !== null &&
          format.abr !== undefined &&
          format.abr <= bitrateLimit[quality])),
  );
  eligible.sort(
    (a, b) =>
      (b.abr ?? 0) - (a.abr ?? 0) ||
      a.format_id.localeCompare(b.format_id, 'en'),
  );
  const highest = eligible[0];
  if (!highest)
    throw new MusicError(
      'STREAM_UNAVAILABLE',
      'No compatible audio format is available.',
    );
  const opus = eligible.find(
    (format) =>
      format.ext === 'webm' &&
      format.acodec?.toLowerCase().startsWith('opus') &&
      (format.abr ?? 0) >= (highest.abr ?? 0) * 0.8 &&
      (highest.abr ?? 0) - (format.abr ?? 0) <= 24,
  );
  const selected = opus ?? highest;
  return {
    formatId: selected.format_id,
    inputType:
      selected.ext === 'webm' &&
      selected.acodec?.toLowerCase().startsWith('opus')
        ? 'webm/opus'
        : 'arbitrary',
  };
}

export interface YtDlpOptions {
  executable?: string;
  spawn?: typeof nodeSpawn;
  maxMetadataBytes?: number;
}

/** Public, unauthenticated YouTube audio only; no arbitrary URL or extractor flags enter this adapter. */
export class YtDlpStreamProvider implements StreamProvider {
  readonly id = 'yt-dlp';
  private readonly spawn: typeof nodeSpawn;
  private readonly executable: string;
  private readonly maxMetadataBytes: number;

  constructor(options: YtDlpOptions = {}) {
    this.spawn = options.spawn ?? nodeSpawn;
    this.executable = options.executable ?? 'yt-dlp';
    this.maxMetadataBytes = options.maxMetadataBytes ?? 8_388_608;
  }

  canStream(track: Track): boolean {
    return (
      (track.sourceProvider === 'youtube-sr' ||
        track.sourceProvider === 'youtube-api') &&
      Boolean(track.sourceId && VIDEO_ID.test(track.sourceId))
    );
  }

  private start(args: string[]): ChildProcessWithoutNullStreams {
    try {
      const child = this.spawn(this.executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }) as ChildProcessWithoutNullStreams;
      child.stdin.on('error', () => {});
      return child;
    } catch {
      throw new MusicError(
        'STREAM_UNAVAILABLE',
        'The audio source could not start.',
        true,
      );
    }
  }

  private async inspect(
    url: string,
    signal: AbortSignal,
  ): Promise<AudioFormat[]> {
    const child = this.start([
      '--ignore-config',
      '--no-plugin-dirs',
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--no-cache-dir',
      '--js-runtimes',
      'node',
      '--dump-single-json',
      '--',
      url,
    ]);
    child.stdin.end();
    child.stderr.on('data', () => {});
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      const fail = (error: MusicError) => {
        if (settled) return;
        settled = true;
        cleanup();
        child.kill();
        reject(error);
      };
      const onAbort = () =>
        fail(
          new MusicError(
            'STREAM_CANCELLED',
            'Stream resolution was cancelled.',
          ),
        );
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        if (size > this.maxMetadataBytes) {
          fail(
            new MusicError(
              'STREAM_UNAVAILABLE',
              'Audio format information is too large.',
            ),
          );
          return;
        }
        chunks.push(chunk);
      });
      child.on('error', () =>
        fail(
          new MusicError(
            'STREAM_UNAVAILABLE',
            'The audio source could not start.',
            true,
          ),
        ),
      );
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          fail(
            new MusicError(
              'STREAM_UNAVAILABLE',
              'Audio formats are unavailable.',
              true,
            ),
          );
          return;
        }
        try {
          const parsed = inspectionSchema.parse(
            JSON.parse(Buffer.concat(chunks).toString('utf8')),
          );
          settled = true;
          cleanup();
          resolve(parsed.formats);
        } catch {
          fail(
            new MusicError(
              'STREAM_UNAVAILABLE',
              'Audio formats are unavailable.',
            ),
          );
        }
      });
    });
  }

  async resolveAudio(
    track: Track,
    signal: AbortSignal,
    context?: StreamContext,
  ): Promise<AudioSource> {
    if (signal.aborted)
      throw new MusicError(
        'STREAM_CANCELLED',
        'Stream resolution was cancelled.',
      );
    if (!this.canStream(track))
      throw new MusicError(
        'STREAM_UNAVAILABLE',
        'No playable source is available.',
      );
    const quality = context?.audioQuality ?? DEFAULT_AUDIO_QUALITY;
    const url = `https://www.youtube.com/watch?v=${track.sourceId!}`;
    const selected = selectAudioFormat(
      await this.inspect(url, signal),
      quality,
    );
    if (signal.aborted)
      throw new MusicError(
        'STREAM_CANCELLED',
        'Stream resolution was cancelled.',
      );
    const child = this.start([
      '--ignore-config',
      '--no-plugin-dirs',
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--no-cache-dir',
      '--js-runtimes',
      'node',
      '--format',
      selected.formatId,
      '--output',
      '-',
      '--',
      url,
    ]);
    child.stdin.end();
    child.stderr.on('data', () => {});
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      signal.removeEventListener('abort', dispose);
      child.stdout.destroy();
      child.stdin.destroy();
      child.stderr.destroy();
      child.kill();
    };
    signal.addEventListener('abort', dispose, { once: true });
    child.on('error', () => {
      if (!disposed)
        child.stdout.destroy(
          new MusicError('STREAM_UNAVAILABLE', 'Audio streaming failed.', true),
        );
      dispose();
    });
    child.on('close', (code) => {
      signal.removeEventListener('abort', dispose);
      if (!disposed && code !== 0)
        child.stdout.destroy(
          new MusicError('STREAM_UNAVAILABLE', 'Audio streaming failed.', true),
        );
    });
    child.stdout.on('error', () => {});
    if (signal.aborted) {
      dispose();
      throw new MusicError(
        'STREAM_CANCELLED',
        'Stream resolution was cancelled.',
      );
    }
    return {
      kind: 'readable',
      input: child.stdout,
      inputType: selected.inputType,
      sourceProvider: this.id,
      seekable: false,
      audioQuality: quality,
      dispose,
    };
  }
}
