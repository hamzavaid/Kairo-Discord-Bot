import { randomUUID } from 'node:crypto';
import type { PlaybackAttempt, PlaybackOutcome } from '../api/history.js';
import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  type AudioPlayer,
  type AudioResource,
  type VoiceConnection,
  type PlayerSubscription,
} from '@discordjs/voice';
import {
  validateVolume,
  validateFilter,
  type FilterPreset,
} from './PlaybackControls.js';
import { MusicError } from '../api/errors.js';
import type { PlaybackSnapshot } from '../api/playback.js';
import type { QueueEntry } from '../api/queue.js';
import type { Track } from '../domain/Track.js';
import type { AudioSource, PreparedAudio } from '../stream/AudioSource.js';
import { FFmpegPipeline } from '../stream/FFmpegPipeline.js';
import { StreamResolver } from '../stream/StreamResolver.js';
import type { AudioQuality } from '../stream/AudioQuality.js';
import { DEFAULT_AUDIO_QUALITY } from '../stream/AudioQuality.js';
import {
  PlaybackStateMachine,
  type PlaybackState,
} from './PlaybackStateMachine.js';

export interface PlaybackSessionOptions {
  onAttempt?: (attempt: PlaybackAttempt) => void;
  prepareTrack?: (track: Track, signal: AbortSignal) => Promise<Track>;
  guildId: string;
  resolver: Pick<StreamResolver, 'resolve'>;
  player?: AudioPlayer;
  createResource?: typeof createAudioResource;
  prepare?: (source: AudioSource, filter?: FilterPreset) => PreparedAudio;
  onEnded?: (
    generation: number,
    cause: 'track-ended' | 'stream-failed',
  ) => void;
  onStateChanged?: (state: PlaybackState, generation: number) => void;
  onFailure?: (code: string, generation: number) => void;
  onSourceSelected?: (
    source: AudioSource,
    entry: QueueEntry,
    quality: AudioQuality,
    generation: number,
  ) => void;
  bufferTimeoutMs?: number;
  ffmpegPath?: string;
  audioQualityForGuild?: (
    guildId: string,
    signal: AbortSignal,
  ) => Promise<AudioQuality>;
}

const streamType: Record<string, StreamType> = {
  opus: StreamType.Opus,
  'ogg/opus': StreamType.OggOpus,
  'webm/opus': StreamType.WebmOpus,
  raw: StreamType.Raw,
  arbitrary: StreamType.Arbitrary,
};

export class PlaybackSession {
  private readonly machine = new PlaybackStateMachine();
  private readonly player: AudioPlayer;
  private readonly prepare: (
    source: AudioSource,
    filter?: FilterPreset,
  ) => PreparedAudio;
  private readonly createResource: typeof createAudioResource;
  private connection: VoiceConnection | undefined;
  private subscription: PlayerSubscription | undefined;
  private abort: AbortController | undefined;
  private prepared: PreparedAudio | undefined;
  private entry: QueueEntry | undefined;
  private generation = 0;
  private attempt: PlaybackAttempt | undefined;
  private listeningSince: number | undefined;
  private listenedMs = 0;
  private volume = 100;
  private filter: FilterPreset = 'flat';
  private resource: AudioResource | undefined;
  private suppressed = new Set<number>();
  private bufferTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: PlaybackSessionOptions) {
    this.player =
      options.player ??
      createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play },
      });
    this.createResource = options.createResource ?? createAudioResource;
    const pipeline = new FFmpegPipeline(
      options.ffmpegPath ? { executable: options.ffmpegPath } : {},
    );
    this.prepare =
      options.prepare ?? ((source, filter) => pipeline.prepare(source, filter));
    this.player.on('stateChange', (oldState, newState) => {
      if (
        newState.status === AudioPlayerStatus.Playing &&
        this.machine.state === 'BUFFERING'
      ) {
        this.clearBufferTimer();
        this.transition('PLAYING');
      } else if (
        newState.status === AudioPlayerStatus.Paused &&
        this.machine.state === 'PLAYING'
      )
        this.transition('PAUSED');
      else if (newState.status === AudioPlayerStatus.Idle) {
        const ended =
          'resource' in oldState
            ? (oldState.resource.metadata as
                { generation?: number } | undefined)
            : undefined;
        const token = ended?.generation;
        if (
          token !== undefined &&
          token === this.generation &&
          !this.suppressed.has(token)
        ) {
          this.stop('completed');
          this.options.onEnded?.(token, 'track-ended');
        }
      }
    });
    this.player.on('error', () => {
      this.fail(
        new MusicError('STREAM_UNAVAILABLE', 'Playback failed.'),
        this.generation,
      );
    });
  }

  private transition(next: PlaybackState): void {
    if (this.machine.state === 'PLAYING' && this.listeningSince !== undefined) {
      this.listenedMs += Math.max(0, performance.now() - this.listeningSince);
      this.listeningSince = undefined;
    }
    this.machine.transition(next);
    if (next === 'PLAYING') {
      this.listeningSince = performance.now();
      if (this.attempt && !this.attempt.startedAt) {
        this.attempt.startedAt = new Date();
        this.attempt.status = 'playing';
        this.options.onAttempt?.(structuredClone(this.attempt));
      }
    }
    this.options.onStateChanged?.(next, this.generation);
  }

  attach(connection: VoiceConnection): void {
    if (this.connection === connection) return;
    if (this.connection) this.disconnect();
    this.transition('CONNECTING');
    this.connection = connection;
    this.subscription = connection.subscribe(this.player);
    if (!this.subscription) {
      this.connection = undefined;
      this.transition('ERROR');
      this.transition('DISCONNECTED');
      throw new MusicError(
        'VOICE_JOIN_ERROR',
        'Could not subscribe to voice playback.',
      );
    }
    this.transition('IDLE');
  }

  start(entry: QueueEntry, generation: number): void {
    if (!this.connection)
      throw new MusicError('VOICE_JOIN_ERROR', 'Join a voice channel first.');
    if (this.entry && this.generation === generation) return;
    if (this.machine.state !== 'IDLE') this.stop();
    this.entry = structuredClone(entry);
    this.listenedMs = 0;
    this.listeningSince = undefined;
    this.attempt = {
      attemptId: randomUUID(),
      guildId: this.options.guildId,
      userId: entry.enqueuedBy,
      track: structuredClone(entry.track),
      requestedAt: new Date(),
      status: 'playing',
      source: entry.source ?? 'manual',
      listenedMs: 0,
    };
    this.generation = generation;
    this.abort = new AbortController();
    this.suppressed.clear();
    this.transition('RESOLVING');
    void this.resolveAndPlay(entry, generation, this.abort.signal);
  }

  private async resolveAndPlay(
    entry: QueueEntry,
    generation: number,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      if (this.options.prepareTrack) {
        const track = await this.options.prepareTrack(entry.track, signal);
        if (signal.aborted || this.generation !== generation) return;
        entry = { ...entry, track };
        this.entry = structuredClone(entry);
      }
      let audioQuality: AudioQuality = DEFAULT_AUDIO_QUALITY;
      if (this.options.audioQualityForGuild)
        audioQuality = await this.options.audioQualityForGuild(
          this.options.guildId,
          signal,
        );
      if (signal.aborted || this.generation !== generation) return;
      const source = await this.options.resolver.resolve(entry.track, signal, {
        guildId: this.options.guildId,
        audioQuality,
      });
      if (signal.aborted || this.generation !== generation) {
        source.dispose?.();
        return;
      }
      this.options.onSourceSelected?.(source, entry, audioQuality, generation);
      let prepared: PreparedAudio;
      try {
        prepared = this.prepare(source, this.filter);
      } catch (error) {
        source.dispose?.();
        throw error;
      }
      if (signal.aborted || this.generation !== generation) {
        prepared.dispose();
        return;
      }
      this.prepared = prepared;
      const resource = this.createResource(prepared.input, {
        inputType: streamType[prepared.inputType] ?? StreamType.Arbitrary,
        metadata: { generation },
        inlineVolume: true,
      });
      this.resource = resource;
      resource.volume?.setVolume(this.volume / 100);
      this.transition('BUFFERING');
      this.bufferTimer = setTimeout(
        () =>
          this.fail(
            new MusicError(
              'STREAM_TIMEOUT',
              'Audio buffering timed out.',
              true,
            ),
            generation,
          ),
        this.options.bufferTimeoutMs ?? 15_000,
      );
      this.player.play(resource);
    } catch (error) {
      if (signal.aborted || this.generation !== generation) return;
      this.fail(error, generation);
    }
  }

  private fail(error: unknown, generation: number): void {
    if (
      !this.entry ||
      generation !== this.generation ||
      this.suppressed.has(generation)
    )
      return;
    const code =
      error instanceof MusicError ? error.code : 'STREAM_UNAVAILABLE';
    this.transition('ERROR');
    this.options.onFailure?.(code, generation);
    this.stop('failed');
    this.options.onEnded?.(generation, 'stream-failed');
  }

  private clearBufferTimer(): void {
    if (this.bufferTimer) clearTimeout(this.bufferTimer);
    this.bufferTimer = undefined;
  }

  setVolume(volume: number): PlaybackSnapshot {
    validateVolume(volume);
    this.volume = volume;
    this.resource?.volume?.setVolume(volume / 100);
    return this.snapshot();
  }
  setFilter(filter: FilterPreset): PlaybackSnapshot {
    validateFilter(filter);
    this.filter = filter;
    return this.snapshot();
  }
  pause(): PlaybackSnapshot {
    if (this.machine.state !== 'PLAYING' || !this.player.pause())
      throw new MusicError(
        'INVALID_PLAYBACK_TRANSITION',
        'Playback is not playing.',
      );
    if (this.machine.state === 'PLAYING') this.transition('PAUSED');
    return this.snapshot();
  }

  resume(): PlaybackSnapshot {
    if (this.machine.state !== 'PAUSED' || !this.player.unpause())
      throw new MusicError(
        'INVALID_PLAYBACK_TRANSITION',
        'Playback is not paused.',
      );
    if (this.machine.state === 'PAUSED') this.transition('PLAYING');
    return this.snapshot();
  }

  stop(
    outcome: Exclude<PlaybackOutcome, 'playing'> = 'stopped',
  ): PlaybackSnapshot {
    if (this.machine.state === 'DISCONNECTED' || this.machine.state === 'IDLE')
      return this.snapshot();
    this.suppressed.add(this.generation);
    if (this.attempt) {
      const elapsed =
        this.listenedMs +
        (this.listeningSince === undefined
          ? 0
          : Math.max(0, performance.now() - this.listeningSince));
      const observed = this.resource?.playbackDuration;
      this.attempt.listenedMs = Math.max(0, Math.round(observed ?? elapsed));
      if (!this.attempt.startedAt) this.attempt.listenedMs = 0;
      this.attempt.status = outcome;
      this.attempt.endedAt = new Date();
      const finished = this.attempt;
      this.attempt = undefined;
      this.options.onAttempt?.(structuredClone(finished));
    }
    this.clearBufferTimer();
    this.abort?.abort();
    this.abort = undefined;
    this.prepared?.dispose();
    this.prepared = undefined;
    this.resource = undefined;
    this.transition('STOPPING');
    this.player.stop(true);
    this.entry = undefined;
    this.transition('IDLE');
    return this.snapshot();
  }

  disconnect(): PlaybackSnapshot {
    if (this.machine.state === 'DISCONNECTED') return this.snapshot();
    this.stop('disconnected');
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.connection = undefined;
    this.transition('DISCONNECTED');
    return this.snapshot();
  }

  snapshot(): PlaybackSnapshot {
    return {
      guildId: this.options.guildId,
      state: this.machine.state,
      current: this.entry ? structuredClone(this.entry) : undefined,
      generation: this.generation,
      volume: this.volume,
      filter: this.filter,
    };
  }
}
