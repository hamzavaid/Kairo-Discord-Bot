import {
  MusicError,
  type QueueSnapshot,
  type PlaybackSnapshot,
  type Track,
  type TrackCollection,
  type VoiceTarget,
} from '@kairo/music-engine';
import { KairoMusicClient } from './KairoMusicClient.js';
import { CommandError } from '../errors.js';

export interface PlayInput {
  guildId: string;
  userId: string;
  query: string;
  voiceTarget: VoiceTarget;
}

export interface PlayOutcome {
  track: Track;
  /** One-based upcoming position; zero means the track is current. */
  position: number;
  collection?: Pick<TrackCollection, 'title' | 'importSummary'> & {
    queued: number;
  };
}

/** Bot-side orchestration. Music state and playback remain engine-owned. */
export class MusicService {
  private readonly channels = new Map<string, string>();

  constructor(private readonly client: KairoMusicClient) {}

  assertVoiceChannel(guildId: string, userChannelId?: string): void {
    if (!userChannelId)
      throw new CommandError(
        'USER_NOT_IN_VOICE',
        'Join a voice channel first.',
      );
    const botChannel = this.channels.get(guildId);
    if (botChannel && botChannel !== userChannelId)
      throw new CommandError(
        'WRONG_VOICE_CHANNEL',
        'Join the bot’s voice channel.',
      );
  }

  private async resolve(
    input: string,
    guildId: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<Track> {
    const result = signal
      ? await this.client.parse(
          input,
          guildId,
          userId,
          undefined,
          undefined,
          signal,
        )
      : await this.client.parse(input, guildId, userId);
    if (result.kind === 'track') return result.track;
    if (result.kind === 'search' && result.candidates[0])
      return result.candidates[0];
    throw new MusicError('NO_SEARCH_RESULTS', 'No matching song was found.');
  }

  play(input: PlayInput): Promise<PlayOutcome> {
    return this.playAt(input);
  }

  playNext(input: PlayInput): Promise<PlayOutcome> {
    return this.playAt(input, 'next');
  }

  private async playAt(
    input: PlayInput,
    insertion?: 'next',
  ): Promise<PlayOutcome> {
    const { guildId, userId, query, voiceTarget } = input;
    const state = this.client.getPlayback(guildId).state;
    const connected = state !== 'DISCONNECTED';
    if (connected) this.assertVoiceChannel(guildId, voiceTarget.channelId);
    const parsed = await this.client.parse(query, guildId, userId, true);
    let tracks: Track[];
    const collection =
      parsed.kind === 'collection' ? parsed.collection : undefined;
    if (collection) {
      if (!collection.tracks.length)
        throw new MusicError(
          'COLLECTION_EMPTY',
          'The collection has no playable tracks.',
        );
      // Matching and stream acquisition happen only when each queued entry starts.
      tracks = collection.tracks;
    } else {
      const metadata =
        parsed.kind === 'track'
          ? parsed.track
          : parsed.kind === 'search'
            ? parsed.candidates[0]
            : undefined;
      if (!metadata)
        throw new MusicError(
          'NO_SEARCH_RESULTS',
          'No matching song was found.',
        );
      const track = await this.client.preparePlayable(metadata);
      if (!this.client.canPlay(track))
        throw new MusicError(
          'STREAM_UNAVAILABLE',
          'No playable source is available.',
        );
      tracks = [track];
    }
    if (!connected) {
      await this.client.connectVoice(voiceTarget);
      this.channels.set(guildId, voiceTarget.channelId);
    }
    const queue = collection
      ? await this.client.enqueueMany(guildId, tracks, userId, insertion)
      : await this.client.enqueue(guildId, tracks[0]!, userId, insertion);
    // If an empty queue consumed the first inserted entry as current, N - 1
    // entries remain upcoming. Otherwise all N entries occupy the chosen end.
    const appendedPosition = queue.upcoming.length - tracks.length + 1;
    const position =
      appendedPosition <= 0 ? 0 : insertion === 'next' ? 1 : appendedPosition;
    return {
      track: tracks[0]!,
      position,
      ...(collection
        ? {
            collection: {
              title: collection.title,
              queued: tracks.length,
              ...(collection.importSummary
                ? { importSummary: collection.importSummary }
                : {}),
            },
          }
        : {}),
    };
  }

  info(
    input: string,
    guildId: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<Track> {
    return this.resolve(input, guildId, userId, signal);
  }
  async infoResults(
    input: string,
    guildId: string,
    userId: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<Track[]> {
    if (!Number.isInteger(count) || count < 1 || count > 25)
      throw new MusicError('INVALID_QUERY', 'Choose 1 to 25 search results.');
    const result = await this.client.parse(
      input,
      guildId,
      userId,
      undefined,
      count,
      signal,
    );
    const tracks =
      result.kind === 'track'
        ? [result.track]
        : result.kind === 'search'
          ? result.candidates.slice(0, count)
          : [];
    if (!tracks.length)
      throw new MusicError('NO_SEARCH_RESULTS', 'No matching song was found.');
    return tracks;
  }
  async collection(
    input: string,
    guildId: string,
    userId: string,
  ): Promise<TrackCollection> {
    const result = await this.client
      .parse(input, guildId, userId, true)
      .catch((error: unknown) => {
        if (
          error instanceof MusicError &&
          (error.code === 'UNSUPPORTED_PROVIDER' ||
            error.code === 'INVALID_QUERY')
        )
          throw new MusicError(
            'COLLECTION_UNSUPPORTED',
            'Enter a supported playlist or album URL.',
          );
        throw error;
      });
    if (result.kind !== 'collection')
      throw new MusicError(
        'COLLECTION_UNSUPPORTED',
        'Enter a supported playlist or album URL.',
      );
    return result.collection;
  }
  currentTrack(guildId: string): Track {
    const track = this.client.getPlayback(guildId).current?.track;
    if (!track)
      throw new MusicError(
        'QUEUE_EMPTY',
        'There is no currently playing track.',
      );
    return track;
  }
  async playTracks(input: {
    guildId: string;
    userId: string;
    voiceTarget: VoiceTarget;
    tracks: Track[];
    position?: 'next' | 'last';
  }): Promise<{ queued: number }> {
    if (!input.tracks.length)
      throw new MusicError('COLLECTION_EMPTY', 'The collection is empty.');
    this.assertVoiceChannel(input.guildId, input.voiceTarget.channelId);
    if (this.client.getPlayback(input.guildId).state === 'DISCONNECTED') {
      await this.client.connectVoice(input.voiceTarget);
      this.channels.set(input.guildId, input.voiceTarget.channelId);
    }
    await this.client.enqueueMany(
      input.guildId,
      input.tracks.map((track) => ({ ...track, requestedBy: input.userId })),
      input.userId,
      ...(input.position ? [input.position] : []),
    );
    return { queued: input.tracks.length };
  }

  queue(guildId: string): QueueSnapshot {
    return this.client.getQueue(guildId);
  }

  playback(guildId: string) {
    return this.client.getPlayback(guildId);
  }

  shuffle(guildId: string, expectedGeneration?: number) {
    return this.client.shuffle(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  previous(guildId: string, expectedGeneration?: number) {
    return this.client.previous(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  setVolume(
    guildId: string,
    volume: number,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot> {
    return this.client.setVolume(
      guildId,
      volume,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }
  setFilter(
    guildId: string,
    filter: import('@kairo/music-engine').FilterPreset,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot> {
    return this.client.setFilter(
      guildId,
      filter,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }
  setRepeat(
    guildId: string,
    mode: import('@kairo/music-engine').RepeatMode,
    expectedGeneration?: number,
  ): Promise<QueueSnapshot> {
    return this.client.setRepeat(
      guildId,
      mode,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }
  searchQueue(guildId: string, query: string) {
    return this.client.searchQueue(guildId, query);
  }
  removeEntry(guildId: string, entryId: string, expectedGeneration?: number) {
    return this.client.removeEntry(guildId, entryId, expectedGeneration);
  }
  moveEntry(
    guildId: string,
    entryId: string,
    toEntryId: string,
    expectedGeneration?: number,
  ) {
    return this.client.moveEntry(
      guildId,
      entryId,
      toEntryId,
      expectedGeneration,
    );
  }
  clearQueue(guildId: string, expectedGeneration?: number) {
    return this.client.clearQueue(guildId, expectedGeneration);
  }
  pause(guildId: string, expectedGeneration?: number) {
    return this.client.pause(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  resume(guildId: string, expectedGeneration?: number) {
    return this.client.resume(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  skip(guildId: string, expectedGeneration?: number) {
    return this.client.skip(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  stop(guildId: string, expectedGeneration?: number) {
    return this.client.stop(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  acquirePreview(target: VoiceTarget, ownerId: string) {
    this.assertVoiceChannel(target.guildId, target.channelId);
    return this.client.acquirePreview(target, ownerId);
  }
  playPreview(
    guildId: string,
    leaseId: string,
    track: Track,
    durationMs: number,
  ) {
    return this.client.playPreview({ guildId, leaseId, track, durationMs });
  }
  stopPreview(guildId: string, leaseId: string) {
    return this.client.stopPreview(guildId, leaseId);
  }
  releasePreview(guildId: string, leaseId: string) {
    return this.client.releasePreview(guildId, leaseId);
  }
  async disconnect(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<void> {
    await this.client.disconnectVoice(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
    this.channels.delete(guildId);
  }

  forgetVoiceChannel(guildId: string): void {
    this.channels.delete(guildId);
  }

  voiceChannel(guildId: string): string | undefined {
    return this.channels.get(guildId);
  }
}
