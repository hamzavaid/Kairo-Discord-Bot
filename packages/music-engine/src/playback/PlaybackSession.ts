import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  type AudioPlayer,
  type VoiceConnection,
  type PlayerSubscription,
} from '@discordjs/voice';
import { MusicError } from '../api/errors.js';
import type { PlaybackSnapshot } from '../api/playback.js';
import type { QueueEntry } from '../api/queue.js';
import type { AudioSource, PreparedAudio } from '../stream/AudioSource.js';
import { FFmpegPipeline } from '../stream/FFmpegPipeline.js';
import { StreamResolver } from '../stream/StreamResolver.js';
import {
  PlaybackStateMachine,
  type PlaybackState,
} from './PlaybackStateMachine.js';

export interface PlaybackSessionOptions {
  guildId: string;
  resolver: Pick<StreamResolver, 'resolve'>;
  player?: AudioPlayer;
  createResource?: typeof createAudioResource;
  prepare?: (source: AudioSource) => PreparedAudio;
  onEnded?: (
    generation: number,
    cause: 'track-ended' | 'stream-failed',
  ) => void;
  onStateChanged?: (state: PlaybackState, generation: number) => void;
  onFailure?: (code: string, generation: number) => void;
  bufferTimeoutMs?: number;
  ffmpegPath?: string;
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
  private readonly prepare: (source: AudioSource) => PreparedAudio;
  private readonly createResource: typeof createAudioResource;
  private connection: VoiceConnection | undefined;
  private subscription: PlayerSubscription | undefined;
  private abort: AbortController | undefined;
  private prepared: PreparedAudio | undefined;
  private entry: QueueEntry | undefined;
  private generation = 0;
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
    this.prepare = options.prepare ?? ((source) => pipeline.prepare(source));
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
          this.stop();
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
    this.machine.transition(next);
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
      const source = await this.options.resolver.resolve(entry.track, signal);
      if (signal.aborted || this.generation !== generation) return;
      const prepared = this.prepare(source);
      if (signal.aborted || this.generation !== generation) {
        prepared.dispose();
        return;
      }
      this.prepared = prepared;
      const resource = this.createResource(prepared.input, {
        inputType: streamType[prepared.inputType] ?? StreamType.Arbitrary,
        metadata: { generation },
      });
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
    this.stop();
    this.options.onEnded?.(generation, 'stream-failed');
  }

  private clearBufferTimer(): void {
    if (this.bufferTimer) clearTimeout(this.bufferTimer);
    this.bufferTimer = undefined;
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

  stop(): PlaybackSnapshot {
    if (this.machine.state === 'DISCONNECTED' || this.machine.state === 'IDLE')
      return this.snapshot();
    this.suppressed.add(this.generation);
    this.clearBufferTimer();
    this.abort?.abort();
    this.abort = undefined;
    this.prepared?.dispose();
    this.prepared = undefined;
    this.transition('STOPPING');
    this.player.stop(true);
    this.entry = undefined;
    this.transition('IDLE');
    return this.snapshot();
  }

  disconnect(): PlaybackSnapshot {
    if (this.machine.state === 'DISCONNECTED') return this.snapshot();
    this.stop();
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
    };
  }
}
