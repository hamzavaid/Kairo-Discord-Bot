import { z } from 'zod';
import { MusicError } from '../../api/errors.js';
import type { SpotifyOptions } from '../../api/MetadataOptions.js';
import type { ClassifiedInput } from '../../parser/QueryClassifier.js';
import type { MediaProvider, ProviderTrack } from '../MediaProvider.js';
import { TimedCache } from '../musicbrainz/TimedCache.js';
import { boundedJson } from './transport.js';

const trackSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9]{22}$/u),
  name: z.string().min(1),
  duration_ms: z.number().int().positive(),
  artists: z
    .array(z.object({ id: z.string().optional(), name: z.string().min(1) }))
    .min(1),
  album: z
    .object({
      id: z.string().optional(),
      name: z.string().min(1),
      images: z.array(z.object({ url: z.string().url() })).optional(),
    })
    .optional(),
  external_urls: z.object({ spotify: z.string().url() }).optional(),
  explicit: z.boolean().optional(),
});
const searchSchema = z.object({
  tracks: z.object({ items: z.array(trackSchema) }),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export class SpotifyProvider implements MediaProvider {
  readonly id = 'spotify';
  readonly capabilities = { search: true, trackUrl: true };
  private token?: { value: string; expiresAt: number };
  private readonly cache = new TimedCache<ProviderTrack[]>(256, Date.now);
  constructor(private readonly options: SpotifyOptions) {
    if (!options.clientId?.trim() || !options.clientSecret?.trim())
      throw new Error(
        'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required for spotify.',
      );
  }
  canParse(input: ClassifiedInput): boolean {
    return input.kind === 'provider-track' && input.providerId === this.id;
  }
  private normalize(raw: z.infer<typeof trackSchema>): ProviderTrack {
    return {
      sourceId: raw.id,
      title: raw.name,
      artists: raw.artists.map((artist) => ({
        name: artist.name,
        ...(artist.id ? { id: artist.id } : {}),
      })),
      durationMs: raw.duration_ms,
      ...(raw.album?.images?.[0]
        ? { artworkUrl: raw.album.images[0].url }
        : {}),
      canonicalUrl:
        raw.external_urls?.spotify ??
        `https://open.spotify.com/track/${raw.id}`,
      ...(raw.explicit === undefined ? {} : { explicit: raw.explicit }),
      ...(raw.album
        ? {
            album: {
              title: raw.album.name,
              ...(raw.album.id ? { id: raw.album.id } : {}),
            },
          }
        : {}),
    };
  }
  private async accessToken(signal?: AbortSignal): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt)
      return this.token.value;
    const raw = await boundedJson(
      this.options.fetcher ?? fetch,
      'https://accounts.spotify.com/api/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      },
      this.options.timeoutMs ?? 8000,
      signal,
    );
    const parsed = tokenSchema.safeParse(raw);
    if (!parsed.success)
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    this.token = {
      value: parsed.data.access_token,
      expiresAt: Date.now() + Math.max(1, parsed.data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }
  private async request(path: string, signal?: AbortSignal): Promise<unknown> {
    const token = await this.accessToken(signal);
    return boundedJson(
      this.options.fetcher ?? fetch,
      `https://api.spotify.com/v1/${path}`,
      { headers: { Authorization: `Bearer ${token}` } },
      this.options.timeoutMs ?? 8000,
      signal,
    );
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
    const parsed = trackSchema.safeParse(
      await this.request(`tracks/${input.sourceId}`, signal),
    );
    if (!parsed.success)
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    return this.normalize(parsed.data);
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
        `search?${new URLSearchParams({ q: query, type: 'track', limit: String(maxResults) })}`,
        signal,
      ),
    );
    if (!parsed.success)
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    const tracks = parsed.data.tracks.items.map((item) => this.normalize(item));
    this.cache.set(key, tracks, this.options.searchCacheMs ?? 300_000);
    return tracks;
  }
}
