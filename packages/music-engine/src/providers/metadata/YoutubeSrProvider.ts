import { YouTube } from 'youtube-sr';
import { z } from 'zod';
import { MusicError } from '../../api/errors.js';
import type { YoutubeSrOptions } from '../../api/MetadataOptions.js';
import type { ClassifiedInput } from '../../parser/QueryClassifier.js';
import type { MediaProvider, ProviderTrack } from '../MediaProvider.js';

const videoSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/u),
  title: z.string().min(1),
  duration: z.number().nonnegative().optional(),
  channel: z
    .object({ name: z.string().min(1) })
    .nullable()
    .optional(),
  thumbnail: z.object({ url: z.string().url() }).nullable().optional(),
  live: z.boolean().optional(),
});

export class YoutubeSrProvider implements MediaProvider {
  readonly id = 'youtube-sr';
  readonly capabilities = { search: true, trackUrl: true };
  constructor(private readonly options: YoutubeSrOptions = {}) {}

  canParse(input: ClassifiedInput): boolean {
    return input.kind === 'provider-track' && input.providerId === this.id;
  }

  private normalize(raw: unknown): ProviderTrack {
    const parsed = videoSchema.safeParse(raw);
    if (!parsed.success)
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    const video = parsed.data;
    return {
      sourceId: video.id,
      title: video.title,
      artists: [{ name: video.channel?.name ?? 'Unknown YouTube channel' }],
      ...(video.duration ? { durationMs: video.duration } : {}),
      ...(video.thumbnail ? { artworkUrl: video.thumbnail.url } : {}),
      canonicalUrl: `https://www.youtube.com/watch?v=${video.id}`,
      isLive: video.live ?? false,
    };
  }

  private async run<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(),
      this.options.timeoutMs ?? 8000,
    );
    const active = signal
      ? AbortSignal.any([signal, timeout.signal])
      : timeout.signal;
    let onAbort: (() => void) | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<T>((_, reject) => {
          if (active.aborted) reject(active.reason);
          else {
            onAbort = () => reject(active.reason);
            active.addEventListener('abort', onAbort, { once: true });
          }
        }),
      ]);
    } catch (error) {
      if (signal?.aborted)
        throw new MusicError(
          'PARSER_CANCELLED',
          'The music request was cancelled.',
        );
      if (timeout.signal.aborted)
        throw new MusicError(
          'PROVIDER_TIMEOUT',
          'The music source timed out.',
          true,
        );
      if (error instanceof MusicError) throw error;
      throw new MusicError(
        'PROVIDER_UNAVAILABLE',
        'The music source is temporarily unavailable.',
        true,
      );
    } finally {
      clearTimeout(timer);
      if (onAbort) active.removeEventListener('abort', onAbort);
    }
  }

  async parse(
    input: ClassifiedInput,
    signal?: AbortSignal,
  ): Promise<ProviderTrack> {
    if (input.kind !== 'provider-track' || !this.canParse(input))
      throw new MusicError(
        'UNSUPPORTED_PROVIDER',
        'This music source is not supported.',
      );
    const getVideo =
      this.options.getVideo ?? ((url: string) => YouTube.getVideo(url));
    return this.normalize(await this.run(getVideo(input.canonicalUrl), signal));
  }

  async search(
    query: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<ProviderTrack[]> {
    const search =
      this.options.search ??
      ((text: string, options: { limit: number }) =>
        YouTube.search(text, { ...options, type: 'video' }));
    const raw = await this.run(search(query, { limit: maxResults }), signal);
    return raw.slice(0, maxResults).map((item) => this.normalize(item));
  }
}
