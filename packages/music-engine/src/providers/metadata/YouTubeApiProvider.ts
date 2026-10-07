import { z } from 'zod';
import {
  MUSIC_SEARCH_POOL_SIZE,
  rankMusicSearchResults,
} from './musicSearchRanking.js';
import { MusicError } from '../../api/errors.js';
import type { YouTubeApiOptions } from '../../api/MetadataOptions.js';
import type { ClassifiedInput } from '../../parser/QueryClassifier.js';
import type {
  MediaProvider,
  ProviderTrack,
  ProviderCollection,
} from '../MediaProvider.js';
import { TimedCache } from '../musicbrainz/TimedCache.js';
import { boundedJson } from './transport.js';

const searchSchema = z.object({
  items: z.array(z.object({ id: z.object({ videoId: z.string() }) })),
});
const videosSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().regex(/^[A-Za-z0-9_-]{11}$/u),
      snippet: z.object({
        title: z.string().min(1),
        channelTitle: z.string().min(1),
        thumbnails: z.record(z.object({ url: z.string().url() })).optional(),
      }),
      contentDetails: z.object({ duration: z.string().optional() }).optional(),
    }),
  ),
});

function durationMs(value?: string): number | undefined {
  if (!value) return undefined;
  const parts =
    /^P(?:([0-9]+)D)?T?(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?$/u.exec(
      value,
    );
  if (!parts) return undefined;
  const ms =
    (((Number(parts[1] ?? 0) * 24 + Number(parts[2] ?? 0)) * 60 +
      Number(parts[3] ?? 0)) *
      60 +
      Number(parts[4] ?? 0)) *
    1000;
  return ms > 0 ? ms : undefined;
}

export class YouTubeApiProvider implements MediaProvider {
  readonly id = 'youtube-api';
  readonly capabilities = { search: true, trackUrl: true };
  private readonly cache = new TimedCache<ProviderTrack[]>(256, Date.now);
  constructor(private readonly options: YouTubeApiOptions) {
    if (!options.apiKey?.trim())
      throw new Error('YOUTUBE_API_KEY is required for youtube-api.');
  }
  canParse(input: ClassifiedInput): boolean {
    return input.kind === 'provider-track' && input.providerId === this.id;
  }
  private async request(
    path: 'search' | 'videos' | 'playlistItems',
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    url.searchParams.set('key', this.options.apiKey);
    this.options.onQuotaUse?.(path, 1);
    return boundedJson(
      this.options.fetcher ?? fetch,
      url.toString(),
      {},
      this.options.timeoutMs ?? 8000,
      signal,
    );
  }
  private async videos(
    ids: string[],
    signal?: AbortSignal,
  ): Promise<ProviderTrack[]> {
    if (ids.length === 0) return [];
    const parsed = videosSchema.safeParse(
      await this.request(
        'videos',
        { part: 'snippet,contentDetails', id: ids.join(',') },
        signal,
      ),
    );
    if (!parsed.success)
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    const byId = new Map(parsed.data.items.map((video) => [video.id, video]));
    return ids.flatMap((id) => {
      const video = byId.get(id);
      if (!video) return [];
      const duration = durationMs(video.contentDetails?.duration);
      const artworkUrl =
        video.snippet.thumbnails?.high?.url ??
        video.snippet.thumbnails?.default?.url;
      return [
        {
          sourceId: id,
          title: video.snippet.title,
          artists: [{ name: video.snippet.channelTitle }],
          ...(duration ? { durationMs: duration } : {}),
          ...(artworkUrl ? { artworkUrl } : {}),
          canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
        },
      ];
    });
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
    const [track] = await this.videos([input.sourceId], signal);
    if (!track)
      throw new MusicError('NO_SEARCH_RESULTS', 'No matching song was found.');
    return track;
  }
  async search(
    query: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<ProviderTrack[]> {
    const key = `${query.toLocaleLowerCase('en')}|${maxResults}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const parsed = searchSchema.safeParse(
      await this.request(
        'search',
        {
          part: 'snippet',
          type: 'video',
          q: query,
          maxResults: String(Math.max(MUSIC_SEARCH_POOL_SIZE, maxResults)),
        },
        signal,
      ),
    );
    if (!parsed.success)
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    const results = await this.videos(
      parsed.data.items
        .slice(0, Math.max(MUSIC_SEARCH_POOL_SIZE, maxResults))
        .map((item) => item.id.videoId),
      signal,
    );
    const ranked = rankMusicSearchResults(query, results).slice(0, maxResults);
    this.cache.set(key, ranked, this.options.searchCacheMs ?? 300_000);
    return ranked;
  }

  async getCollection(
    input: Extract<ClassifiedInput, { kind: 'provider-collection' }>,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ProviderCollection> {
    const pageSchema = z.object({
      items: z.array(
        z.object({
          contentDetails: z.object({ videoId: z.string() }).optional(),
        }),
      ),
      nextPageToken: z.string().max(1000).optional(),
      pageInfo: z.object({ totalResults: z.number().int().nonnegative() }),
    });
    const tracks: ProviderTrack[] = [];
    let scanned = 0;
    let total = 0;
    let skipped = 0;
    let failed = 0;
    let partial = false;
    let token: string | undefined;
    const seen = new Set<string>();
    do {
      if (signal?.aborted)
        throw new MusicError(
          'PARSER_CANCELLED',
          'The music request was cancelled.',
        );
      try {
        const page = pageSchema.parse(
          await this.request(
            'playlistItems',
            {
              part: 'contentDetails',
              playlistId: input.sourceId,
              maxResults: String(Math.min(50, limit - scanned)),
              ...(token ? { pageToken: token } : {}),
            },
            signal,
          ),
        );
        total = page.pageInfo.totalResults;
        const items = page.items.slice(0, limit - scanned);
        const ids = items.flatMap((item) =>
          item.contentDetails?.videoId &&
          /^[A-Za-z0-9_-]{11}$/u.test(item.contentDetails.videoId)
            ? [item.contentDetails.videoId]
            : [],
        );
        skipped += items.length - ids.length;
        const videos = await this.videos(ids, signal);
        tracks.push(...videos);
        skipped += ids.length - videos.length;
        scanned += items.length;
        token = page.nextPageToken;
        if (!items.length || (token && seen.has(token))) {
          partial = Boolean(token);
          break;
        }
        if (token) seen.add(token);
      } catch (error) {
        if (signal?.aborted) throw error;
        if (!scanned)
          throw new MusicError(
            'COLLECTION_IMPORT_FAILED',
            'The collection could not be imported.',
          );
        failed += Math.max(0, Math.min(total, limit) - scanned);
        partial = true;
        break;
      }
    } while (token && scanned < limit);
    return {
      title: 'YouTube playlist',
      tracks,
      total,
      skipped,
      failed,
      truncated: total > limit,
      partial,
    };
  }
}
