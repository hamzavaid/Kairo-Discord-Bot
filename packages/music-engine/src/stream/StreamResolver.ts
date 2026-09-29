import { MusicError } from '../api/errors.js';
import type { Track } from '../domain/Track.js';
import type { AudioSource } from './AudioSource.js';
import type { StreamProvider } from './StreamProvider.js';
import type { StreamContext } from './AudioQuality.js';
import { DEFAULT_AUDIO_QUALITY } from './AudioQuality.js';

function cancellable(
  work: Promise<AudioSource>,
  signal: AbortSignal,
): Promise<AudioSource> {
  if (signal.aborted)
    return Promise.reject(
      new MusicError('STREAM_CANCELLED', 'Stream resolution was cancelled.'),
    );
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const onAbort = () => {
      cancelled = true;
      reject(
        new MusicError('STREAM_CANCELLED', 'Stream resolution was cancelled.'),
      );
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        if (cancelled || signal.aborted) {
          value.dispose?.();
          return;
        }
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export class StreamResolver {
  constructor(
    private readonly providers: readonly StreamProvider[],
    private readonly options: { timeoutMs?: number } = {},
  ) {
    if (
      !Number.isFinite(options.timeoutMs ?? 8000) ||
      (options.timeoutMs ?? 8000) < 1
    )
      throw new MusicError('INVALID_QUERY', 'Stream timeout must be positive.');
  }

  canResolve(track: Track): boolean {
    return this.providers.some((provider) => provider.canStream(track));
  }

  async resolve(
    track: Track,
    signal: AbortSignal,
    context?: StreamContext,
  ): Promise<AudioSource> {
    if (signal.aborted)
      throw new MusicError(
        'STREAM_CANCELLED',
        'Stream resolution was cancelled.',
      );
    const provider = this.providers.find((item) => item.canStream(track));
    if (!provider)
      throw new MusicError(
        'STREAM_UNAVAILABLE',
        'No playable source is available.',
      );
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(),
      this.options.timeoutMs ?? 8000,
    );
    const combined = AbortSignal.any([signal, timeout.signal]);
    try {
      return await cancellable(
        provider.resolveAudio(
          track,
          combined,
          context ?? { audioQuality: DEFAULT_AUDIO_QUALITY },
        ),
        combined,
      );
    } catch (error) {
      if (signal.aborted)
        throw new MusicError(
          'STREAM_CANCELLED',
          'Stream resolution was cancelled.',
        );
      if (timeout.signal.aborted)
        throw new MusicError(
          'STREAM_TIMEOUT',
          'Stream resolution timed out.',
          true,
        );
      if (error instanceof MusicError) throw error;
      throw new MusicError(
        'STREAM_UNAVAILABLE',
        'No playable source is available.',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
