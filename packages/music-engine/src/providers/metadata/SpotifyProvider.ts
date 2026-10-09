import { z } from 'zod';
import { MusicError } from '../../api/errors.js';
import type { SpotifyOptions } from '../../api/MetadataOptions.js';
import type { ClassifiedInput } from '../../parser/QueryClassifier.js';
import type {
  MediaProvider,
  ProviderTrack,
  ProviderCollection,
} from '../MediaProvider.js';
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
  refresh_token: z.string().min(1).optional(),
});

export class SpotifyProvider implements MediaProvider {
  readonly id = 'spotify';
  readonly capabilities = { search: true, trackUrl: true };
  private refreshToken: string | undefined;
  private token: { value: string; expiresAt: number } | undefined;
  private readonly cache = new TimedCache<ProviderTrack[]>(256, Date.now);
  constructor(private readonly options: SpotifyOptions) {
    this.refreshToken = options.refreshToken?.trim() || undefined;
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
    let raw: unknown;
    try {
      raw = await boundedJson(
        this.options.fetcher ?? fetch,
        'https://accounts.spotify.com/api/token',
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: this.refreshToken
            ? new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
              }).toString()
            : 'grant_type=client_credentials',
        },
        this.options.timeoutMs ?? 8000,
        signal,
      );
    } catch (error) {
      if (error instanceof MusicError) {
        const unauthorized =
          error.code === 'PROVIDER_AUTH_REQUIRED' ||
          (Boolean(this.refreshToken) && error.diagnostics?.httpStatus === 400);
        throw new MusicError(
          unauthorized ? 'PROVIDER_AUTH_REQUIRED' : error.code,
          unauthorized
            ? 'Spotify account authorization must be renewed.'
            : error.message,
          error.retryable,
          error.correlationId,
          { ...error.diagnostics, provider: this.id, operation: 'token' },
        );
      }
      throw error;
    }
    const parsed = tokenSchema.safeParse(raw);
    if (!parsed.success)
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    if (
      parsed.data.refresh_token &&
      parsed.data.refresh_token !== this.refreshToken
    ) {
      this.refreshToken = parsed.data.refresh_token;
      await this.options.onRefreshToken?.(this.refreshToken);
    }
    this.token = {
      value: parsed.data.access_token,
      expiresAt: Date.now() + Math.max(1, parsed.data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }
  private async request(
    path: string,
    signal?: AbortSignal,
    operation = 'metadata',
  ): Promise<unknown> {
    try {
      const token = await this.accessToken(signal);
      const load = (access: string) =>
        boundedJson(
          this.options.fetcher ?? fetch,
          `https://api.spotify.com/v1/${path}`,
          { headers: { Authorization: `Bearer ${access}` } },
          this.options.timeoutMs ?? 8000,
          signal,
        );
      try {
        return await load(token);
      } catch (error) {
        if (
          !(error instanceof MusicError) ||
          error.code !== 'PROVIDER_AUTH_REQUIRED' ||
          !this.refreshToken
        )
          throw error;
        // Retry one expired/revoked access token using the configured user grant.
        this.token = undefined;
        return await load(await this.accessToken(signal));
      }
    } catch (error) {
      if (error instanceof MusicError)
        throw new MusicError(
          error.code,
          error.message,
          error.retryable,
          error.correlationId,
          {
            ...error.diagnostics,
            provider: this.id,
            operation: error.diagnostics?.operation ?? operation,
          },
        );
      throw error;
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

  async getCollection(
    input: Extract<ClassifiedInput, { kind: 'provider-collection' }>,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ProviderCollection> {
    const base = `${input.resourceType === 'album' ? 'albums' : 'playlists'}/${input.sourceId}`;
    const metadata = z
      .object({ name: z.string().min(1) })
      .safeParse(
        await this.request(
          `${base}?fields=name`,
          signal,
          `${input.resourceType}-metadata`,
        ),
      );
    if (!metadata.success)
      throw new MusicError(
        'COLLECTION_IMPORT_FAILED',
        'The collection could not be imported.',
      );
    const tracks: ProviderTrack[] = [];
    let offset = 0;
    let total = 0;
    let skipped = 0;
    let failed = 0;
    let partial = false;
    const pageSchema = z.object({
      items: z.array(z.unknown()),
      total: z.number().int().nonnegative(),
      next: z.string().nullable().optional(),
    });
    while (offset < limit) {
      if (signal?.aborted)
        throw new MusicError(
          'PARSER_CANCELLED',
          'The music request was cancelled.',
        );
      let page: z.infer<typeof pageSchema>;
      try {
        page = pageSchema.parse(
          await this.request(
            `${base}/${input.resourceType === 'album' ? 'tracks' : 'items'}?${new URLSearchParams({ limit: String(Math.min(50, limit - offset)), offset: String(offset) })}`,
            signal,
            input.resourceType === 'album' ? 'album-tracks' : 'playlist-items',
          ),
        );
      } catch (error) {
        if (
          signal?.aborted ||
          (error instanceof MusicError &&
            [
              'PARSER_CANCELLED',
              'PROVIDER_AUTH_REQUIRED',
              'PROVIDER_ACCESS_DENIED',
            ].includes(error.code))
        )
          throw error;
        if (!offset)
          throw new MusicError(
            'COLLECTION_IMPORT_FAILED',
            'The collection could not be imported.',
            error instanceof MusicError && error.retryable,
            undefined,
            error instanceof MusicError
              ? error.diagnostics
              : {
                  provider: this.id,
                  operation: `${input.resourceType}-items`,
                  reason: 'invalid-response',
                },
          );
        failed += Math.max(0, Math.min(total, limit) - offset);
        partial = true;
        break;
      }
      total = page.total;
      const items = page.items.slice(0, limit - offset);
      for (const wrapper of items) {
        let raw = wrapper;
        if (input.resourceType === 'playlist') {
          if (!wrapper || typeof wrapper !== 'object') {
            skipped++;
            continue;
          }
          const item = wrapper as {
            item?: unknown;
            track?: unknown;
            is_local?: boolean;
          };
          if (item.is_local) {
            skipped++;
            continue;
          }
          raw = item.item ?? item.track;
        }
        if (
          !raw ||
          (typeof raw === 'object' &&
            (('is_local' in raw && raw.is_local === true) ||
              ('is_playable' in raw && raw.is_playable === false) ||
              ('type' in raw && raw.type === 'episode')))
        ) {
          skipped++;
          continue;
        }
        const parsed = trackSchema.safeParse(raw);
        if (!parsed.success) {
          failed++;
          continue;
        }
        const track = this.normalize(parsed.data);
        if (input.resourceType === 'album' && !track.album)
          track.album = { title: metadata.data.name, id: input.sourceId };
        tracks.push(track);
      }
      offset += items.length;
      if (!items.length || !page.next || offset >= total) break;
    }
    return {
      title: metadata.data.name,
      tracks,
      total,
      skipped,
      failed,
      truncated: total > limit,
      partial: partial || failed > 0,
    };
  }
}
