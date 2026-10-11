import type { Track } from '@kairo/music-engine';
import { CommandError } from '../errors.js';
export type LyricsResult =
  | { kind: 'lyrics'; provider: string; text: string }
  | { kind: 'instrumental' | 'not-found'; provider: string };
export interface LyricsProvider {
  readonly id: string;
  get(track: Track, signal?: AbortSignal): Promise<LyricsResult>;
}
export class LrcLibLyricsProvider implements LyricsProvider {
  readonly id = 'lrclib';
  constructor(private readonly request: typeof fetch = fetch) {}
  async get(track: Track, signal?: AbortSignal): Promise<LyricsResult> {
    signal?.throwIfAborted();
    const url = new URL('https://lrclib.net/api/get');
    url.searchParams.set('track_name', track.title);
    url.searchParams.set(
      'artist_name',
      track.artists.map((a) => a.name).join(', '),
    );
    if (track.album) url.searchParams.set('album_name', track.album.title);
    if (track.durationMs !== undefined)
      url.searchParams.set(
        'duration',
        String(Math.round(track.durationMs / 1000)),
      );
    const response = await this.request(url.href, {
      headers: {
        'User-Agent': 'Kairo/0.0.0 (Discord music metadata client)',
        Accept: 'application/json',
      },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (response.status === 404)
      return { kind: 'not-found', provider: this.id };
    if (
      !response.ok ||
      Number(response.headers.get('content-length') ?? 0) > 65536
    )
      throw new Error('Lyrics provider request failed.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty lyrics response.');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > 65536) {
          await reader.cancel();
          throw new Error('Lyrics response exceeded limit.');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const payload: unknown = JSON.parse(
      Buffer.concat(chunks).toString('utf-8'),
    );
    if (!payload || typeof payload !== 'object')
      throw new Error('Invalid lyrics response.');
    const data = payload as {
      instrumental?: unknown;
      plainLyrics?: unknown;
      syncedLyrics?: unknown;
    };
    if (data.instrumental === true)
      return { kind: 'instrumental', provider: this.id };
    const raw =
      typeof data.plainLyrics === 'string' && data.plainLyrics.trim()
        ? data.plainLyrics
        : typeof data.syncedLyrics === 'string'
          ? data.syncedLyrics.replace(/^\[\d+:\d+(?:\.\d+)?\]\s*/gmu, '')
          : '';
    const text = raw.trim();
    if (!text) return { kind: 'not-found', provider: this.id };
    if (text.length > 32000) throw new Error('Lyrics text exceeded limit.');
    return { kind: 'lyrics', provider: this.id, text };
  }
}
export class LyricsService {
  constructor(
    private readonly providers: readonly LyricsProvider[] = [
      new LrcLibLyricsProvider(),
    ],
  ) {}
  async get(track: Track, signal?: AbortSignal): Promise<LyricsResult> {
    let failure: unknown;
    let notFound = false;
    for (const provider of this.providers) {
      signal?.throwIfAborted();
      try {
        const result = await provider.get(track, signal);
        if (result.kind !== 'not-found') return result;
        notFound = true;
      } catch (error) {
        if (signal?.aborted) throw error;
        failure = error;
      }
    }
    if (notFound)
      return {
        kind: 'not-found',
        provider: this.providers.at(-1)?.id ?? 'none',
      };
    throw new CommandError(
      'LYRICS_PROVIDER_UNAVAILABLE',
      'Lyrics are temporarily unavailable.',
      { cause: failure },
    );
  }
}
