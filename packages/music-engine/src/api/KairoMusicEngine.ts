import { randomUUID } from 'node:crypto';
import { WorkScope, OperationError, Metrics, FairLimiter } from '@kairo/shared';
import { ProcessRegistry } from '../reliability/ProcessRegistry.js';
import { ProviderSupervisor } from '../reliability/ProviderSupervisor.js';
import type { ReliabilityOptions, EngineHealth } from './reliability.js';
import {
  validateVolume,
  validateFilter,
  type FilterPreset,
} from '../playback/PlaybackControls.js';
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
import { PlayableCandidateResolver } from '../matching/PlayableCandidateResolver.js';
import type { Track } from '../domain/Track.js';
import { QueueManager } from '../queue/QueueManager.js';
import { QueueMutex } from '../queue/QueueMutex.js';
import { VoiceManager } from '../playback/VoiceManager.js';
import { PlaybackSession } from '../playback/PlaybackSession.js';
import { StreamResolver } from '../stream/StreamResolver.js';
import {
  YtDlpStreamProvider,
  type YtDlpOptions,
} from '../stream/YtDlpStreamProvider.js';
import type { AudioQuality } from '../stream/AudioQuality.js';
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
  metrics?: Metrics;
  reliability?: ReliabilityOptions;
  playbackDefaultsForGuild?: (
    guildId: string,
  ) => Promise<{ volume: number; filter: FilterPreset; repeat: RepeatMode }>;
  maxCollectionItems?: number;
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
  playableSearchProvider?: 'youtube-sr' | 'youtube-api';
  maxQueueEntries?: number;
  fixtureAudio?: Readonly<Record<string, FixtureAudio>>;
  playbackRuntime?: PlaybackRuntime;
  streamTimeoutMs?: number;
  bufferTimeoutMs?: number;
  ffmpegPath?: string;
  ytDlp?: YtDlpOptions;
  audioQualityForGuild?: (
    guildId: string,
    signal: AbortSignal,
  ) => Promise<AudioQuality>;
}

export interface KairoMusicEngine {
  getHealth(): EngineHealth;
  parse(request: ParseRequest): Promise<ParseResult>;
  preparePlayable(track: Track, signal?: AbortSignal): Promise<Track>;
  canPlay(track: import('../domain/Track.js').Track): boolean;
  matchCandidates(request: MatchRequest): MatchResult;
  enqueue(request: EnqueueRequest): Promise<QueueSnapshot>;
  enqueueMany(request: EnqueueManyRequest): Promise<QueueSnapshot>;
  enqueueAutoplay(
    request: EnqueueRequest & { expectedGeneration: number },
  ): Promise<boolean>;
  getQueue(guildId: string): QueueSnapshot;
  searchQueue(
    guildId: string,
    query: string,
  ): import('./queue.js').QueueEntry[];
  skip(guildId: string, expectedGeneration?: number): Promise<QueueSnapshot>;
  stop(guildId: string, expectedGeneration?: number): Promise<QueueSnapshot>;
  clear(guildId: string, expectedGeneration?: number): Promise<QueueSnapshot>;
  remove(request: RemoveRequest): Promise<QueueSnapshot>;
  move(request: MoveRequest): Promise<QueueSnapshot>;
  shuffle(guildId: string, expectedGeneration?: number): Promise<QueueSnapshot>;
  setRepeat(
    guildId: string,
    mode: RepeatMode,
    expectedGeneration?: number,
  ): Promise<QueueSnapshot>;
  previous(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<QueueSnapshot>;
  connectVoice(target: VoiceTarget): Promise<PlaybackSnapshot>;
  disconnectVoice(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot>;
  seek(
    guildId: string,
    positionMs: number,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot>;
  acquirePreview(
    target: VoiceTarget,
    ownerId: string,
  ): Promise<{ leaseId: string }>;
  playPreview(request: {
    guildId: string;
    leaseId: string;
    track: Track;
    durationMs: number;
  }): Promise<void>;
  stopPreview(guildId: string, leaseId: string): Promise<void>;
  releasePreview(guildId: string, leaseId: string): Promise<void>;
  getPlayback(guildId: string): PlaybackSnapshot;
  setVolume(
    guildId: string,
    volume: number,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot>;
  setFilter(
    guildId: string,
    filter: FilterPreset,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot>;
  pause(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot>;
  resume(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot>;
  on<T extends KairoMusicEvent['type']>(
    type: T,
    listener: (event: Extract<KairoMusicEvent, { type: T }>) => void,
  ): Unsubscribe;
  shutdown(): Promise<void>;
}

export function createKairoMusicEngine(
  options: EngineOptions = {},
): KairoMusicEngine {
  const maxCollectionItems = options.maxCollectionItems ?? 200;
  const work = new WorkScope(30_000);
  const metrics = options.metrics ?? new Metrics();
  const limits = options.reliability ?? {};
  for (const [key, value] of Object.entries(limits)) {
    if (
      !Number.isInteger(value) ||
      value < (key === 'maxWaiting' ? 0 : 1) ||
      value > 600_000
    )
      throw new MusicError('INVALID_QUERY', 'Invalid reliability limits.');
  }
  const metadataGate = new FairLimiter(
    limits.providerConcurrency ?? 8,
    limits.providerPerGuild ?? 2,
    limits.maxWaiting ?? 64,
  );
  const streamGate = new FairLimiter(
    limits.streamConcurrency ?? 4,
    1,
    limits.maxWaiting ?? 64,
  );
  const collectionGate = new FairLimiter(
    limits.collectionConcurrency ?? 2,
    1,
    limits.maxWaiting ?? 16,
  );
  const resources = new ProcessRegistry(limits.ffmpegProcesses ?? 8, metrics);
  if (
    !Number.isInteger(maxCollectionItems) ||
    maxCollectionItems < 1 ||
    maxCollectionItems > 1000
  )
    throw new MusicError('INVALID_QUERY', 'Collection limit must be 1–1000.');
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
  const required = new Set([
    selected,
    ...(options.fallbackProviders ?? []),
    options.playableSearchProvider ?? 'youtube-sr',
  ]);
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
  const supervisor = new ProviderSupervisor({
    metrics,
    ...(options.reliability?.providerAttempts !== undefined
      ? { attempts: options.reliability.providerAttempts }
      : {}),
    ...(options.reliability?.circuitFailures !== undefined
      ? { failureThreshold: options.reliability.circuitFailures }
      : {}),
    ...(options.reliability?.circuitCooldownMs !== undefined
      ? { cooldownMs: options.reliability.circuitCooldownMs }
      : {}),
  });
  registry.ids().forEach((id) => supervisor.register(id));
  const manager = new MetadataProviderManager(
    registry,
    selected,
    options.fallbackProviders ?? [],
    Boolean(options.fixtureTracks && !options.metadataProvider),
    supervisor,
    collectionGate,
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
  const playable = new PlayableCandidateResolver(
    manager,
    matcher,
    options.playableSearchProvider ?? 'youtube-sr',
  );
  const queues = new QueueManager(
    options.maxQueueEntries === undefined
      ? {}
      : { maxEntries: options.maxQueueEntries },
  );
  const voice = new VoiceManager({
    onRecovery: (guildId, state) => {
      if (state === 'attempt') metrics.increment('reconnect_attempts_total');
      if (state === 'failed') metrics.increment('reconnect_failures_total');
      if (state === 'recovering' || state === 'recovered') {
        sessions.get(guildId)?.recoverVoice(state === 'recovering');
        previews.get(guildId)?.session.recoverVoice(state === 'recovering');
      }
    },
    ...(options.playbackRuntime?.joinVoiceChannel
      ? { join: options.playbackRuntime.joinVoiceChannel }
      : {}),
    ...(options.playbackRuntime?.waitVoiceReady
      ? { waitReady: options.playbackRuntime.waitVoiceReady }
      : {}),
    onDisconnect: (guildId) => {
      void lock(guildId)
        .runExclusive(async () => {
          await releasePreviewInternal(guildId, false);
          sessions.get(guildId)?.disconnect();
          await queues.stop(guildId);
        })
        .catch(() => {});
    },
  });
  const resolver = new StreamResolver(
    [
      new FixtureStreamProvider(options.fixtureAudio ?? {}),
      new YtDlpStreamProvider({ ...options.ytDlp, resources }),
    ],
    {
      ...(options.streamTimeoutMs === undefined
        ? {}
        : { timeoutMs: options.streamTimeoutMs }),
      gate: streamGate,
      metrics,
    },
  );
  let closing = false;
  const previews = new Map<
    string,
    {
      leaseId: string;
      session: PlaybackSession;
      originalConnected: boolean;
      timer?: NodeJS.Timeout;
      expiry?: NodeJS.Timeout;
      durationMs: number;
      reject?: (e: Error) => void;
      resolve?: () => void;
    }
  >();
  const sessions = new Map<string, PlaybackSession>();
  const coordinator = new Map<string, QueueMutex>();
  const listeners = new Map<
    KairoMusicEvent['type'],
    Set<(event: KairoMusicEvent) => void>
  >();
  let shutdownWork: Promise<void> | undefined;
  const watchdog = setInterval(() => {
    if (closing) return;
    for (const [guildId, active] of sessions) {
      if (active.watchdog(Date.now(), limits.stuckSessionMs ?? 45_000))
        metrics.increment('watchdog_cleanups_total');
      if (!voice.get(guildId) && active.snapshot().state !== 'DISCONNECTED')
        active.disconnect();
    }
    for (const value of previews.values())
      if (value.session.watchdog(Date.now(), limits.stuckSessionMs ?? 45_000))
        metrics.increment('watchdog_cleanups_total');
    resources.sweep(
      (guildId) =>
        Boolean(voice.get(guildId)) &&
        (sessions.get(guildId)?.snapshot().current !== undefined ||
          previews.has(guildId)),
    );
  }, limits.watchdogIntervalMs ?? 5000);
  watchdog.unref();

  function emit(event: KairoMusicEvent): void {
    if (event.type === 'playbackAttempt' && event.status !== 'playing')
      metrics.increment('track_play_seconds', event.listenedMs / 1000);
    if (
      event.type === 'playbackSourceSelected' &&
      event.matchConfidence !== undefined
    )
      metrics.observe('candidate_match_score', event.matchConfidence);
    if (event.type === 'playbackFailed')
      metrics.increment('stream_resolution_failures_total');
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

  function assertGeneration(
    guildId: string,
    expectedGeneration?: number,
    allowPreview = false,
  ): void {
    if (!allowPreview) assertMusicAvailable(guildId);
    if (
      expectedGeneration !== undefined &&
      queues.snapshot(guildId).generation !== expectedGeneration
    )
      throw new MusicError(
        'STALE_PLAYBACK',
        'The song changed. Refresh the player and try again.',
      );
  }
  function assertMusicAvailable(guildId: string) {
    if (closing)
      throw new MusicError('STREAM_CANCELLED', 'The engine is shutting down.');
    if (previews.has(guildId))
      throw new MusicError(
        'PLAYBACK_OWNED',
        'A music trivia game currently owns voice playback.',
      );
  }
  async function connectOwned(target: VoiceTarget) {
    try {
      return await voice.connect(target);
    } catch (error) {
      if (closing)
        throw new MusicError(
          'STREAM_CANCELLED',
          'Voice join was cancelled during shutdown.',
        );
      throw error;
    }
  }
  function preview(guildId: string, leaseId: string) {
    const value = previews.get(guildId);
    if (!value || value.leaseId !== leaseId)
      throw new MusicError(
        'PREVIEW_EXPIRED',
        'The preview session has expired.',
      );
    return value;
  }
  function stopPreviewInternal(guildId: string) {
    const value = previews.get(guildId);
    if (!value) return;
    if (value.timer) clearTimeout(value.timer);
    value.reject?.(new MusicError('STREAM_CANCELLED', 'Preview cancelled.'));
    delete value.reject;
    delete value.resolve;
    value.session.stop();
  }
  async function releasePreviewInternal(guildId: string, restore = true) {
    const value = previews.get(guildId);
    if (!value) return;
    stopPreviewInternal(guildId);
    if (value.expiry) clearTimeout(value.expiry);
    previews.delete(guildId);
    value.session.disconnect();
    const connection = voice.get(guildId);
    if (restore && value.originalConnected && connection) {
      try {
        session(guildId).attach(connection);
      } catch (error) {
        await voice.disconnect(guildId);
        throw error;
      }
    } else await voice.disconnect(guildId);
  }
  function session(guildId: string): PlaybackSession {
    let current = sessions.get(guildId);
    if (!current) {
      if (sessions.size >= (limits.maxSessions ?? 100)) {
        metrics.increment('backpressure_rejections_total');
        throw new MusicError(
          'RESOURCE_BUSY',
          'The playback session limit has been reached.',
          true,
        );
      }
      current = new PlaybackSession({
        resources,
        guildId,
        onAttempt: (attempt) => emit({ type: 'playbackAttempt', ...attempt }),
        resolver,
        prepareTrack: (track, signal) =>
          metadataGate.run(
            guildId,
            () => playable.prepare(track, signal),
            signal,
          ),
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
        ...(options.audioQualityForGuild === undefined
          ? {}
          : { audioQualityForGuild: options.audioQualityForGuild }),
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
        onSourceSelected: (source, entry, audioQuality, generation) =>
          emit({
            type: 'playbackSourceSelected',
            guildId,
            generation,
            trackId: entry.track.id,
            metadataProvider:
              entry.track.provenance.originalSourceProvider ??
              entry.track.sourceProvider,
            ...(entry.track.provenance.candidateSearchProvider
              ? {
                  candidateSearchProvider:
                    entry.track.provenance.candidateSearchProvider,
                }
              : {}),
            ...(entry.track.provenance.selectedCandidateId
              ? {
                  selectedCandidateId:
                    entry.track.provenance.selectedCandidateId,
                }
              : {}),
            ...(entry.track.provenance.confidence === undefined
              ? {}
              : { matchConfidence: entry.track.provenance.confidence }),
            streamProvider: source.sourceProvider,
            audioQuality: source.audioQuality ?? audioQuality,
          }),
      });
      sessions.set(guildId, current);
    }
    return current;
  }

  function sync(guildId: string, snapshot: QueueSnapshot): void {
    const current = sessions.get(guildId);
    if (previews.has(guildId)) return;
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
      const finished = queues.snapshot(guildId).current;
      const snapshot = await queues.advance(
        guildId,
        generation,
        cause === 'track-ended' ? 'track-ended' : 'skip',
      );
      sync(guildId, snapshot);
      if (!snapshot.current && !snapshot.upcoming.length && finished)
        emit({
          type: 'queueExhausted',
          guildId,
          generation: snapshot.generation,
          seed: finished.track,
          userId: finished.enqueuedBy,
          cause,
        });
    });
  }

  async function enqueueMany(
    request: EnqueueManyRequest,
  ): Promise<QueueSnapshot> {
    return lock(request.guildId).runExclusive(async () => {
      assertMusicAvailable(request.guildId);
      const snapshot = await queues.enqueueMany(
        request.guildId,
        request.tracks,
        request.enqueuedBy,
        request.position,
      );
      metrics.observe(
        'queue_depth',
        snapshot.upcoming.length + Number(Boolean(snapshot.current)),
      );
      sync(request.guildId, snapshot);
      return snapshot;
    });
  }

  return {
    getHealth() {
      metrics.set('active_voice_sessions', voice.snapshot().active);
      metrics.set('active_background_jobs', work.active);
      const providers = supervisor.snapshot();
      return {
        status: closing
          ? 'closed'
          : providers.some((p) => p.circuit !== 'CLOSED')
            ? 'degraded'
            : 'healthy',
        providers,
        resources: {
          ffmpegProcesses: resources.snapshot().ffmpeg,
          ytDlpProcesses: resources.snapshot().ytDlp,
          pendingMetadata: metadataGate.snapshot().waiting,
          activeMetadata: metadataGate.snapshot().active,
          activeStreams: streamGate.snapshot().active,
          activeCollections: collectionGate.snapshot().active,
          activeVoiceSessions: voice.snapshot().active,
          pendingOperations: work.active,
        },
        metrics: metrics.snapshot(),
      };
    },
    preparePlayable(track, signal) {
      return work
        .run((active) => playable.prepare(track, active), signal)
        .catch(cancelError);
    },
    canPlay(track) {
      return resolver.canResolve(track);
    },
    enqueue(request) {
      return enqueueMany({
        guildId: request.guildId,
        tracks: [request.track],
        enqueuedBy: request.enqueuedBy,
        ...(request.position === undefined
          ? {}
          : { position: request.position }),
      });
    },
    enqueueMany,
    enqueueAutoplay(request) {
      return lock(request.guildId).runExclusive(async () => {
        const queue = queues.snapshot(request.guildId);
        if (
          previews.has(request.guildId) ||
          queue.generation !== request.expectedGeneration ||
          queue.current ||
          queue.upcoming.length ||
          !sessions.get(request.guildId) ||
          sessions.get(request.guildId)!.snapshot().state === 'DISCONNECTED'
        )
          return false;
        const snapshot = await queues.enqueueMany(
          request.guildId,
          [request.track],
          request.enqueuedBy,
          'last',
          'autoplay',
        );
        sync(request.guildId, snapshot);
        return true;
      });
    },
    searchQueue(guildId, query) {
      const normalize = (value: string) =>
        value
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim();
      const tokens = normalize(query).split(/\s+/u).filter(Boolean);
      if (!tokens.length || query.length > 500)
        throw new MusicError(
          'INVALID_QUERY',
          'Enter a queue search of 1-500 characters.',
        );
      const snapshot = queues.snapshot(guildId);
      return [
        ...(snapshot.current ? [snapshot.current] : []),
        ...snapshot.upcoming,
      ].filter((entry) => {
        const text = normalize(
          [
            entry.track.title,
            ...entry.track.artists.map((a) => a.name),
            entry.track.album?.title ?? '',
          ].join(' '),
        );
        return tokens.every((token) => text.includes(token));
      });
    },
    getQueue(guildId) {
      return queues.snapshot(guildId);
    },
    skip(guildId, expectedGeneration) {
      const observed = queues.snapshot(guildId).generation;
      return lock(guildId).runExclusive(async () => {
        assertGeneration(guildId, expectedGeneration);
        if (queues.snapshot(guildId).generation !== observed)
          return queues.snapshot(guildId);
        const finished = queues.snapshot(guildId).current;
        sessions.get(guildId)?.stop('skipped');
        const snapshot = await queues.advance(guildId, observed, 'skip');
        sync(guildId, snapshot);
        if (!snapshot.current && !snapshot.upcoming.length && finished)
          emit({
            type: 'queueExhausted',
            guildId,
            generation: snapshot.generation,
            seed: finished.track,
            userId: finished.enqueuedBy,
            cause: 'skip',
          });
        return snapshot;
      });
    },
    stop(guildId, expectedGeneration) {
      return lock(guildId).runExclusive(async () => {
        assertGeneration(guildId, expectedGeneration);
        sessions.get(guildId)?.stop();
        return queues.stop(guildId);
      });
    },
    clear(guildId, expectedGeneration) {
      return lock(guildId).runExclusive(() => {
        assertGeneration(guildId, expectedGeneration);
        return queues.clear(guildId);
      });
    },
    remove(request) {
      return queues.remove(request);
    },
    move(request) {
      return queues.move(request);
    },
    shuffle(guildId, expectedGeneration) {
      return lock(guildId).runExclusive(() => {
        assertGeneration(guildId, expectedGeneration);
        return queues.shuffle(guildId);
      });
    },
    setRepeat(guildId, mode, expectedGeneration) {
      return lock(guildId).runExclusive(() => {
        assertGeneration(guildId, expectedGeneration);
        return queues.setRepeat(guildId, mode);
      });
    },
    previous(guildId, expectedGeneration) {
      return lock(guildId).runExclusive(async () => {
        assertGeneration(guildId, expectedGeneration);
        if (!queues.snapshot(guildId).history.length)
          throw new MusicError(
            'QUEUE_EMPTY',
            'No previous track is available.',
          );
        sessions.get(guildId)?.stop('skipped');
        const snapshot = await queues.previous(guildId);
        sync(guildId, snapshot);
        return snapshot;
      });
    },
    connectVoice(target) {
      return lock(target.guildId).runExclusive(async () => {
        assertMusicAvailable(target.guildId);
        const active = session(target.guildId);
        if (
          active.snapshot().state === 'DISCONNECTED' &&
          options.playbackDefaultsForGuild
        ) {
          const defaults = await options.playbackDefaultsForGuild(
            target.guildId,
          );
          assertMusicAvailable(target.guildId);
          active.setVolume(defaults.volume);
          active.setFilter(defaults.filter);
          await queues.setRepeat(target.guildId, defaults.repeat);
        }
        const connection = await connectOwned(target);
        if (closing) {
          await voice.disconnect(target.guildId);
          throw new MusicError('STREAM_CANCELLED', 'Voice join was cancelled.');
        }
        active.attach(connection);
        sync(target.guildId, queues.snapshot(target.guildId));
        return active.snapshot();
      });
    },
    disconnectVoice(guildId, expectedGeneration) {
      return lock(guildId).runExclusive(async () => {
        assertGeneration(guildId, expectedGeneration, true);
        await releasePreviewInternal(guildId, false);
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
    async seek(guildId, positionMs, expectedGeneration) {
      const admitted = await lock(guildId).runExclusive(() => {
        assertGeneration(guildId, expectedGeneration);
        const active = sessions.get(guildId);
        if (!active)
          throw new MusicError(
            'INVALID_PLAYBACK_TRANSITION',
            'Nothing is playing.',
          );
        return { work: active.seek(positionMs) };
      });
      return admitted.work;
    },
    acquirePreview(target, ownerId) {
      return lock(target.guildId).runExclusive(async () => {
        const guildId = target.guildId,
          queue = queues.snapshot(guildId);
        assertMusicAvailable(guildId);
        if (
          !ownerId ||
          ownerId.length > 100 ||
          queue.current ||
          queue.upcoming.length ||
          !['IDLE', 'DISCONNECTED'].includes(
            sessions.get(guildId)?.snapshot().state ?? 'DISCONNECTED',
          )
        )
          throw new MusicError(
            'PLAYBACK_OWNED',
            'Stop and empty the normal player before starting music trivia.',
          );
        const originalConnected = Boolean(voice.get(guildId));
        const defaultVolume = originalConnected
          ? (session(guildId).snapshot().volume ?? 75)
          : ((await options.playbackDefaultsForGuild?.(guildId))?.volume ?? 75);
        validateVolume(defaultVolume);
        if (closing)
          throw new MusicError(
            'STREAM_CANCELLED',
            'The engine is shutting down.',
          );
        const connection = await connectOwned(target);
        if (closing) {
          await voice.disconnect(guildId);
          throw new MusicError(
            'STREAM_CANCELLED',
            'The preview was cancelled during shutdown.',
          );
        }
        const normal = session(guildId);
        normal.disconnect();
        const leaseId = randomUUID();
        const audio = new PlaybackSession({
          resources,
          guildId,
          resolver,
          prepareTrack: (track, signal) =>
            metadataGate.run(
              guildId,
              () => playable.prepare(track, signal),
              signal,
            ),
          ...(options.playbackRuntime?.createAudioPlayer
            ? { player: options.playbackRuntime.createAudioPlayer() }
            : {}),
          ...(options.playbackRuntime?.createAudioResource
            ? { createResource: options.playbackRuntime.createAudioResource }
            : {}),
          ...(options.ffmpegPath ? { ffmpegPath: options.ffmpegPath } : {}),
          ...(options.audioQualityForGuild
            ? { audioQualityForGuild: options.audioQualityForGuild }
            : {}),
          onStateChanged: (state, generation) => {
            const value = previews.get(guildId);
            if (value?.leaseId !== leaseId) return;
            if (state === 'PLAYING' && value) {
              value.resolve?.();
              delete value.resolve;
              delete value.reject;
              value.timer = setTimeout(() => {
                if (
                  previews.get(guildId)?.leaseId === leaseId &&
                  value.session.snapshot().generation === generation
                )
                  stopPreviewInternal(guildId);
              }, value.durationMs);
              value.timer.unref();
            }
          },
          onEnded: (generation) => {
            const value = previews.get(guildId);
            if (
              value?.leaseId === leaseId &&
              value.session.snapshot().generation === generation
            )
              stopPreviewInternal(guildId);
          },
          onFailure: (code, generation) => {
            const value = previews.get(guildId);
            if (
              value?.leaseId !== leaseId ||
              value.session.snapshot().generation !== generation
            )
              return;
            value?.reject?.(
              new MusicError(
                code as MusicError['code'],
                'Preview audio is unavailable.',
              ),
            );
            if (value) {
              delete value.reject;
              delete value.resolve;
            }
          },
        });
        audio.setVolume(defaultVolume);
        previews.set(guildId, {
          leaseId,
          session: audio,
          originalConnected,
          durationMs: 10000,
        });
        try {
          audio.attach(connection);
        } catch (error) {
          await releasePreviewInternal(guildId);
          throw error;
        }
        const value = previews.get(guildId)!;
        value.expiry = setTimeout(() => {
          void lock(guildId)
            .runExclusive(async () => {
              if (previews.get(guildId)?.leaseId === leaseId)
                await releasePreviewInternal(guildId);
            })
            .catch(() =>
              emit({
                type: 'playbackFailed',
                guildId,
                code: 'VOICE_JOIN_ERROR',
                generation: queues.snapshot(guildId).generation,
              }),
            );
        }, 900000);
        value.expiry.unref();
        return { leaseId };
      });
    },
    async playPreview(request) {
      const admitted = await lock(request.guildId).runExclusive(() => {
        const value = preview(request.guildId, request.leaseId);
        if (
          !Number.isInteger(request.durationMs) ||
          request.durationMs < 1000 ||
          request.durationMs > 30000
        )
          throw new MusicError(
            'INVALID_QUERY',
            'Preview duration must be 1-30 seconds.',
          );
        stopPreviewInternal(request.guildId);
        value.durationMs = request.durationMs;
        const ready = new Promise<void>((resolve, reject) => {
          value.resolve = resolve;
          value.reject = reject;
        });
        value.session.start(
          {
            id: randomUUID(),
            track: request.track,
            enqueuedBy: request.track.requestedBy,
            enqueuedAt: new Date(),
          },
          value.session.snapshot().generation + 1,
        );
        return { ready };
      });
      await admitted.ready;
    },
    stopPreview(guildId, leaseId) {
      return lock(guildId).runExclusive(() => {
        preview(guildId, leaseId);
        stopPreviewInternal(guildId);
      });
    },
    releasePreview(guildId, leaseId) {
      return lock(guildId).runExclusive(async () => {
        if (!previews.has(guildId)) return;
        preview(guildId, leaseId);
        await releasePreviewInternal(guildId);
      });
    },
    getPlayback(guildId) {
      if (previews.has(guildId))
        return {
          guildId,
          state: 'IDLE',
          current: undefined,
          generation: queues.snapshot(guildId).generation,
          previewActive: true,
        };
      return (
        sessions.get(guildId)?.snapshot() ?? {
          guildId,
          state: 'DISCONNECTED',
          current: undefined,
          generation: 0,
          volume: 100,
          filter: 'flat',
        }
      );
    },
    setVolume(guildId, volume, expectedGeneration) {
      return lock(guildId).runExclusive(() => {
        assertGeneration(guildId, expectedGeneration);
        validateVolume(volume);
        return session(guildId).setVolume(volume);
      });
    },
    setFilter(guildId, filter, expectedGeneration) {
      return lock(guildId).runExclusive(() => {
        assertGeneration(guildId, expectedGeneration);
        validateFilter(filter);
        return session(guildId).setFilter(filter);
      });
    },
    pause(guildId, expectedGeneration) {
      return lock(guildId).runExclusive(() => {
        assertGeneration(guildId, expectedGeneration);
        const active = sessions.get(guildId);
        if (!active)
          throw new MusicError(
            'INVALID_PLAYBACK_TRANSITION',
            'Playback is not playing.',
          );
        return active.pause();
      });
    },
    resume(guildId, expectedGeneration) {
      return lock(guildId).runExclusive(() => {
        assertGeneration(guildId, expectedGeneration);
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
      const result = matcher.match(request);
      metrics.observe('candidate_match_score', result.score);
      return result;
    },
    async parse(request) {
      const started = performance.now();
      metrics.increment('parser_requests_total');
      return work
        .run(async (signal) => {
          const release = await metadataGate.acquire(request.guildId, signal);
          try {
            request = { ...request, signal };
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
              if (classified.kind === 'provider-collection') {
                if (!request.allowCollections)
                  throw new MusicError(
                    'COLLECTION_UNSUPPORTED',
                    'Use a collection import command for this URL.',
                  );
                const { provider, value } = await manager.collection(
                  classified,
                  maxCollectionItems,
                  request.signal,
                  request.guildId,
                );
                const tracks: Track[] = [];
                let failed = value.failed;
                for (const payload of value.tracks.slice(
                  0,
                  maxCollectionItems,
                )) {
                  try {
                    tracks.push(
                      normalizeProviderTrack(payload, {
                        providerId: provider.id,
                        input: request.input,
                        requestedBy: request.requestedBy,
                        parsedBy: provider.id,
                      }),
                    );
                  } catch {
                    failed++;
                  }
                }
                if (!tracks.length)
                  throw new MusicError(
                    'COLLECTION_EMPTY',
                    'The collection has no importable tracks.',
                  );
                result = {
                  kind: 'collection',
                  collection: {
                    id: `${provider.id}:${classified.sourceId}`,
                    title: value.title,
                    ...(value.visibility
                      ? { visibility: value.visibility }
                      : {}),
                    sourceProvider: provider.id,
                    sourceId: classified.sourceId,
                    canonicalUrl: classified.canonicalUrl,
                    tracks,
                    importSummary: {
                      total: value.total,
                      imported: tracks.length,
                      skipped: value.skipped,
                      failed,
                      truncated: value.truncated,
                      partial: value.partial || failed > 0,
                    },
                  },
                };
              } else if (classified.kind === 'provider-track') {
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
                const candidates = payloads
                  .slice(0, maxResults)
                  .map((payload) =>
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
              if (error instanceof OperationError) cancelError(error);
              const safeError =
                error instanceof MusicError
                  ? new MusicError(
                      error.code,
                      error.message,
                      error.retryable,
                      request.requestId,
                      error.diagnostics,
                    )
                  : new MusicError(
                      'PROVIDER_PARSE_ERROR',
                      'The music source returned invalid metadata.',
                      false,
                      request.requestId,
                    );
              emit({
                type: 'parseFailed',
                ...eventContext,
                code: safeError.code,
              });
              throw safeError;
            }
          } finally {
            release();
          }
        }, request.signal)
        .catch(cancelError)
        .finally(() =>
          metrics.observe('parser_latency_ms', performance.now() - started),
        );
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
      if (shutdownWork) return shutdownWork;
      closing = true;
      clearInterval(watchdog);
      work.close();
      supervisor.close();
      metadataGate.close();
      streamGate.close();
      collectionGate.close();
      const voiceClosing = voice.shutdown();
      shutdownWork = (async () => {
        for (const guildId of new Set([
          ...sessions.keys(),
          ...previews.keys(),
        ])) {
          await lock(guildId).runExclusive(async () => {
            await releasePreviewInternal(guildId, false);
            sessions.get(guildId)?.disconnect();
            await queues.stop(guildId);
            await voice.disconnect(guildId);
          });
        }
        await voiceClosing;
        resources.close();
        sessions.clear();
        coordinator.clear();
        queues.shutdown();
        listeners.clear();
      })();
      return shutdownWork;
    },
  };
}

function cancelError(error: unknown): never {
  if (error instanceof OperationError)
    throw new MusicError(
      error.code === 'RESOURCE_BUSY'
        ? 'RESOURCE_BUSY'
        : error.code === 'OPERATION_TIMEOUT'
          ? 'PROVIDER_TIMEOUT'
          : 'PARSER_CANCELLED',
      error.message,
      error.code !== 'OPERATION_CANCELLED',
    );
  throw error;
}
