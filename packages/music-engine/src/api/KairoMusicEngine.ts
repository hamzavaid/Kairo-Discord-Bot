import { MusicError } from './errors.js';
import type { KairoMusicEvent, Unsubscribe } from './events.js';
import type { FixtureTrack, ParseRequest, ParseResult } from './requests.js';
import type { MusicBrainzOptions } from './MusicBrainzOptions.js';
import type {
  MetadataProviderId,
  YoutubeSrOptions,
  YouTubeApiOptions,
  SpotifyOptions,
} from './MetadataOptions.js';
import { classifyQuery } from '../parser/QueryClassifier.js';
import { normalizeQuery } from '../parser/QueryNormalizer.js';
import { normalizeProviderTrack } from '../parser/TrackNormalizer.js';
import { FixtureProvider } from '../providers/FixtureProvider.js';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';
import { MusicBrainzProvider } from '../providers/musicbrainz/MusicBrainzProvider.js';
import { YoutubeSrProvider } from '../providers/metadata/YoutubeSrProvider.js';
import { YouTubeApiProvider } from '../providers/metadata/YouTubeApiProvider.js';
import { SpotifyProvider } from '../providers/metadata/SpotifyProvider.js';
import { MetadataProviderManager } from '../providers/MetadataProviderManager.js';
import { CandidateMatcher } from '../matching/CandidateMatcher.js';
import type {
  MatchRequest,
  MatchResult,
  MatchWeights,
  MatcherLogger,
} from '../matching/types.js';

export interface EngineOptions {
  fixtureTracks?: FixtureTrack[];
  providerPriority?: string[];
  musicBrainz?: MusicBrainzOptions;
  metadataProvider?: MetadataProviderId;
  fallbackProviders?: MetadataProviderId[];
  youtubeSr?: YoutubeSrOptions;
  youtubeApi?: YouTubeApiOptions;
  spotify?: SpotifyOptions;
  matchThreshold?: number;
  matcherWeights?: Partial<MatchWeights>;
  providerQuality?: Readonly<Record<string, number>>;
  artistAliases?: Readonly<Record<string, string>>;
  matcherLogger?: MatcherLogger;
}

export interface KairoMusicEngine {
  parse(request: ParseRequest): Promise<ParseResult>;
  matchCandidates(request: MatchRequest): MatchResult;
  on<T extends KairoMusicEvent['type']>(
    type: T,
    listener: (event: Extract<KairoMusicEvent, { type: T }>) => void,
  ): Unsubscribe;
  shutdown(): Promise<void>;
}

export function createKairoMusicEngine(
  options: EngineOptions = {},
): KairoMusicEngine {
  const registry = new ProviderRegistry(options.providerPriority);
  registry.register(new FixtureProvider(options.fixtureTracks ?? []));
  const selected = options.metadataProvider ?? 'youtube-sr';
  const required = new Set([selected, ...(options.fallbackProviders ?? [])]);
  registry.register(new YoutubeSrProvider(options.youtubeSr));
  if (options.youtubeApi || required.has('youtube-api')) {
    if (!options.youtubeApi?.apiKey?.trim())
      throw new MusicError(
        'PROVIDER_CONFIGURATION_ERROR',
        'YOUTUBE_API_KEY is required for youtube-api.',
      );
    registry.register(new YouTubeApiProvider(options.youtubeApi));
  }
  if (options.spotify || required.has('spotify')) {
    if (
      !options.spotify?.clientId?.trim() ||
      !options.spotify?.clientSecret?.trim()
    )
      throw new MusicError(
        'PROVIDER_CONFIGURATION_ERROR',
        'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required for spotify.',
      );
    registry.register(new SpotifyProvider(options.spotify));
  }
  if (options.musicBrainz || required.has('musicbrainz')) {
    if (!options.musicBrainz?.contact?.trim())
      throw new MusicError(
        'PROVIDER_CONFIGURATION_ERROR',
        'MUSICBRAINZ_USER_AGENT contact is required for musicbrainz.',
      );
    registry.register(new MusicBrainzProvider(options.musicBrainz));
  }
  const manager = new MetadataProviderManager(
    registry,
    selected,
    options.fallbackProviders ?? [],
    Boolean(options.fixtureTracks && !options.metadataProvider),
  );
  const matcher = new CandidateMatcher({
    ...(options.matchThreshold === undefined
      ? {}
      : { threshold: options.matchThreshold }),
    ...(options.matcherWeights === undefined
      ? {}
      : { weights: options.matcherWeights }),
    ...(options.providerQuality === undefined
      ? {}
      : { providerQuality: options.providerQuality }),
    ...(options.artistAliases === undefined
      ? {}
      : { artistAliases: options.artistAliases }),
    ...(options.matcherLogger === undefined
      ? {}
      : { logger: options.matcherLogger }),
  });
  const listeners = new Map<
    KairoMusicEvent['type'],
    Set<(event: KairoMusicEvent) => void>
  >();

  function emit(event: KairoMusicEvent): void {
    for (const listener of listeners.get(event.type) ?? []) {
      try {
        listener(event);
      } catch {
        // A client callback cannot change the parser result or suppress other subscribers.
      }
    }
  }

  return {
    matchCandidates(request) {
      return matcher.match(request);
    },
    async parse(request) {
      const eventContext = {
        guildId: request.guildId,
        requestedBy: request.requestedBy,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      };
      try {
        if (request.signal?.aborted) {
          throw new MusicError(
            'PARSER_CANCELLED',
            'The music request was cancelled.',
          );
        }
        if (!request.guildId || !request.requestedBy) {
          throw new MusicError(
            'INVALID_QUERY',
            'A guild and requester are required.',
          );
        }
        const maxResults = request.maxResults ?? 10;
        if (
          !Number.isInteger(maxResults) ||
          maxResults < 1 ||
          maxResults > 25
        ) {
          throw new MusicError(
            'INVALID_QUERY',
            'Choose between 1 and 25 results.',
          );
        }
        const classified = classifyQuery(normalizeQuery(request.input));
        let result: ParseResult;
        if (classified.kind === 'provider-track') {
          const { provider, value: payload } = await manager.lookup(
            classified,
            request.signal,
          );
          result = {
            kind: 'track',
            track: normalizeProviderTrack(payload, {
              providerId: provider.id,
              input: request.input,
              requestedBy: request.requestedBy,
              parsedBy: provider.id,
              canonicalUrl: classified.canonicalUrl,
            }),
          };
        } else {
          const { provider, value: payloads } = await manager.search(
            classified.query,
            maxResults,
            request.preferredProvider,
            request.signal,
          );
          const candidates = payloads.slice(0, maxResults).map((payload) =>
            normalizeProviderTrack(payload, {
              providerId: provider.id,
              input: request.input,
              requestedBy: request.requestedBy,
              parsedBy: 'search',
            }),
          );
          result = { kind: 'search', candidates };
        }
        emit({
          type: 'parseSucceeded',
          ...eventContext,
          resultKind: result.kind,
        });
        return result;
      } catch (error) {
        const safeError =
          error instanceof MusicError
            ? new MusicError(
                error.code,
                error.message,
                error.retryable,
                request.requestId,
              )
            : new MusicError(
                'PROVIDER_PARSE_ERROR',
                'The music source returned invalid metadata.',
                false,
                request.requestId,
              );
        emit({ type: 'parseFailed', ...eventContext, code: safeError.code });
        throw safeError;
      }
    },
    on(type, listener) {
      const bucket =
        listeners.get(type) ?? new Set<(event: KairoMusicEvent) => void>();
      listeners.set(type, bucket);
      const handler = listener as (event: KairoMusicEvent) => void;
      bucket.add(handler);
      return () => bucket.delete(handler);
    },
    async shutdown() {
      listeners.clear();
    },
  };
}
