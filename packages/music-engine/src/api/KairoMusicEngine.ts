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
import { QueueManager } from '../queue/QueueManager.js';
import { QueueMutex } from '../queue/QueueMutex.js';
import { VoiceManager } from '../playback/VoiceManager.js';
import { PlaybackSession } from '../playback/PlaybackSession.js';
import { StreamResolver } from '../stream/StreamResolver.js';
import {
  FixtureStreamProvider,
  type FixtureAudio,
} from '../stream/FixtureStreamProvider.js';
import type {
  VoiceTarget,
  PlaybackSnapshot,
  PlaybackRuntime,
} from './playback.js';
import type {
  EnqueueRequest,
  EnqueueManyRequest,
  QueueSnapshot,
  RemoveRequest,
  MoveRequest,
  RepeatMode,
} from './queue.js';
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
  maxQueueEntries?: number;
  fixtureAudio?: Readonly<Record<string, FixtureAudio>>;
  playbackRuntime?: PlaybackRuntime;
  streamTimeoutMs?: number;
  bufferTimeoutMs?: number;
  ffmpegPath?: string;
}

export interface KairoMusicEngine {
  parse(request: ParseRequest): Promise<ParseResult>;
  canPlay(track: import('../domain/Track.js').Track): boolean;
  matchCandidates(request: MatchRequest): MatchResult;
  enqueue(request: EnqueueRequest): Promise<QueueSnapshot>;
  enqueueMany(request: EnqueueManyRequest): Promise<QueueSnapshot>;
  getQueue(guildId: string): QueueSnapshot;
  skip(guildId: string): Promise<QueueSnapshot>;
  stop(guildId: string): Promise<QueueSnapshot>;
  clear(guildId: string): Promise<QueueSnapshot>;
  remove(request: RemoveRequest): Promise<QueueSnapshot>;
  move(request: MoveRequest): Promise<QueueSnapshot>;
  shuffle(guildId: string): Promise<QueueSnapshot>;
  setRepeat(guildId: string, mode: RepeatMode): Promise<QueueSnapshot>;
  previous(guildId: string): Promise<QueueSnapshot>;
  connectVoice(target: VoiceTarget): Promise<PlaybackSnapshot>;
  disconnectVoice(guildId: string): Promise<PlaybackSnapshot>;
  getPlayback(guildId: string): PlaybackSnapshot;
  pause(guildId: string): Promise<PlaybackSnapshot>;
  resume(guildId: string): Promise<PlaybackSnapshot>;
  on<T extends KairoMusicEvent['type']>(
    type: T,
    listener: (event: Extract<KairoMusicEvent, { type: T }>) => void,
  ): Unsubscribe;
  shutdown(): Promise<void>;
}

export function createKairoMusicEngine(
  options: EngineOptions = {},
): KairoMusicEngine {
  if (
    options.bufferTimeoutMs !== undefined &&
    (!Number.isFinite(options.bufferTimeoutMs) || options.bufferTimeoutMs < 1)
  )
    throw new MusicError('INVALID_QUERY', 'Buffer timeout must be positive.');
  if (options.ffmpegPath !== undefined && !options.ffmpegPath.trim())
    throw new MusicError('INVALID_QUERY', 'FFmpeg path is required.');
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
  const queues = new QueueManager(
    options.maxQueueEntries === undefined
      ? {}
      : { maxEntries: options.maxQueueEntries },
  );
  const voice = new VoiceManager({
    ...(options.playbackRuntime?.joinVoiceChannel
      ? { join: options.playbackRuntime.joinVoiceChannel }
      : {}),
    ...(options.playbackRuntime?.waitVoiceReady
      ? { waitReady: options.playbackRuntime.waitVoiceReady }
      : {}),
    onDisconnect: (guildId) => {
      void lock(guildId).runExclusive(async () => {
        sessions.get(guildId)?.disconnect();
        await queues.stop(guildId);
      });
    },
  });
  const resolver = new StreamResolver(
    [new FixtureStreamProvider(options.fixtureAudio ?? {})],
    options.streamTimeoutMs === undefined
      ? {}
      : { timeoutMs: options.streamTimeoutMs },
  );
  const sessions = new Map<string, PlaybackSession>();
  const coordinator = new Map<string, QueueMutex>();
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

  function lock(guildId: string): QueueMutex {
    let mutex = coordinator.get(guildId);
    if (!mutex) {
      mutex = new QueueMutex();
      coordinator.set(guildId, mutex);
    }
    return mutex;
  }

  function session(guildId: string): PlaybackSession {
    let current = sessions.get(guildId);
    if (!current) {
      current = new PlaybackSession({
        guildId,
        resolver,
        ...(options.playbackRuntime?.createAudioPlayer
          ? { player: options.playbackRuntime.createAudioPlayer() }
          : {}),
        ...(options.playbackRuntime?.createAudioResource
          ? { createResource: options.playbackRuntime.createAudioResource }
          : {}),
        ...(options.bufferTimeoutMs === undefined
          ? {}
          : { bufferTimeoutMs: options.bufferTimeoutMs }),
        ...(options.ffmpegPath === undefined
          ? {}
          : { ffmpegPath: options.ffmpegPath }),
        onEnded: (generation, cause) => {
          void handleEnded(guildId, generation, cause);
        },
        onStateChanged: (state, generation) =>
          emit({ type: 'playbackStateChanged', guildId, state, generation }),
        onFailure: (code, generation) =>
          emit({
            type: 'playbackFailed',
            guildId,
            code: code as MusicError['code'],
            generation,
          }),
      });
      sessions.set(guildId, current);
    }
    return current;
  }

  function sync(guildId: string, snapshot: QueueSnapshot): void {
    const current = sessions.get(guildId);
    if (!current || current.snapshot().state === 'DISCONNECTED') return;
    if (snapshot.current) current.start(snapshot.current, snapshot.generation);
    else current.stop();
  }

  async function handleEnded(
    guildId: string,
    generation: number,
    cause: 'track-ended' | 'stream-failed',
  ): Promise<void> {
    await lock(guildId).runExclusive(async () => {
      if (queues.snapshot(guildId).generation !== generation) return;
      const snapshot = await queues.advance(
        guildId,
        generation,
        cause === 'track-ended' ? 'track-ended' : 'skip',
      );
      sync(guildId, snapshot);
    });
  }

  async function enqueueMany(
    request: EnqueueManyRequest,
  ): Promise<QueueSnapshot> {
    return lock(request.guildId).runExclusive(async () => {
      const snapshot = await queues.enqueueMany(
        request.guildId,
        request.tracks,
        request.enqueuedBy,
      );
      sync(request.guildId, snapshot);
      return snapshot;
    });
  }

  return {
    canPlay(track) {
      return resolver.canResolve(track);
    },
    enqueue(request) {
      return enqueueMany({
        guildId: request.guildId,
        tracks: [request.track],
        enqueuedBy: request.enqueuedBy,
      });
    },
    enqueueMany,
    getQueue(guildId) {
      return queues.snapshot(guildId);
    },
    skip(guildId) {
      const observed = queues.snapshot(guildId).generation;
      return lock(guildId).runExclusive(async () => {
        if (queues.snapshot(guildId).generation !== observed)
          return queues.snapshot(guildId);
        sessions.get(guildId)?.stop();
        const snapshot = await queues.advance(guildId, observed, 'skip');
        sync(guildId, snapshot);
        return snapshot;
      });
    },
    stop(guildId) {
      return lock(guildId).runExclusive(async () => {
        sessions.get(guildId)?.stop();
        return queues.stop(guildId);
      });
    },
    clear(guildId) {
      return queues.clear(guildId);
    },
    remove(request) {
      return queues.remove(request);
    },
    move(request) {
      return queues.move(request);
    },
    shuffle(guildId) {
      return queues.shuffle(guildId);
    },
    setRepeat(guildId, mode) {
      return queues.setRepeat(guildId, mode);
    },
    previous(guildId) {
      return lock(guildId).runExclusive(async () => {
        sessions.get(guildId)?.stop();
        const snapshot = await queues.previous(guildId);
        sync(guildId, snapshot);
        return snapshot;
      });
    },
    connectVoice(target) {
      return lock(target.guildId).runExclusive(async () => {
        const connection = await voice.connect(target);
        const active = session(target.guildId);
        active.attach(connection);
        sync(target.guildId, queues.snapshot(target.guildId));
        return active.snapshot();
      });
    },
    disconnectVoice(guildId) {
      return lock(guildId).runExclusive(async () => {
        const active = sessions.get(guildId);
        active?.disconnect();
        await queues.stop(guildId);
        await voice.disconnect(guildId);
        return (
          active?.snapshot() ?? {
            guildId,
            state: 'DISCONNECTED',
            current: undefined,
            generation: 0,
          }
        );
      });
    },
    getPlayback(guildId) {
      return (
        sessions.get(guildId)?.snapshot() ?? {
          guildId,
          state: 'DISCONNECTED',
          current: undefined,
          generation: 0,
        }
      );
    },
    pause(guildId) {
      return lock(guildId).runExclusive(() => {
        const active = sessions.get(guildId);
        if (!active)
          throw new MusicError(
            'INVALID_PLAYBACK_TRANSITION',
            'Playback is not playing.',
          );
        return active.pause();
      });
    },
    resume(guildId) {
      return lock(guildId).runExclusive(() => {
        const active = sessions.get(guildId);
        if (!active)
          throw new MusicError(
            'INVALID_PLAYBACK_TRANSITION',
            'Playback is not paused.',
          );
        return active.resume();
      });
    },
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
      for (const guildId of [...sessions.keys()]) {
        await lock(guildId).runExclusive(async () => {
          sessions.get(guildId)?.disconnect();
          await queues.stop(guildId);
          await voice.disconnect(guildId);
        });
      }
      await voice.shutdown();
      sessions.clear();
      coordinator.clear();
      queues.shutdown();
      listeners.clear();
    },
  };
}
