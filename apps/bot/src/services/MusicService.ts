import {
  MusicError,
  type QueueSnapshot,
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
  ): Promise<Track> {
    const result = await this.client.parse(input, guildId, userId);
    if (result.kind === 'track') return result.track;
    if (result.kind === 'search' && result.candidates[0])
      return result.candidates[0];
    throw new MusicError('NO_SEARCH_RESULTS', 'No matching song was found.');
  }

  async play(input: PlayInput): Promise<PlayOutcome> {
    const { guildId, userId, query, voiceTarget } = input;
    const state = this.client.getPlayback(guildId).state;
    const connected = state !== 'DISCONNECTED';
    if (connected) this.assertVoiceChannel(guildId, voiceTarget.channelId);
    const metadata = await this.resolve(query, guildId, userId);
    const track = await this.client.preparePlayable(metadata);
    if (!this.client.canPlay(track))
      throw new MusicError(
        'STREAM_UNAVAILABLE',
        'No playable source is available.',
      );
    if (!connected) {
      await this.client.connectVoice(voiceTarget);
      this.channels.set(guildId, voiceTarget.channelId);
    }
    const queue = await this.client.enqueue(guildId, track, userId);
    const position =
      queue.current?.track.id === track.id ? 0 : queue.upcoming.length;
    return { track, position };
  }

  info(input: string, guildId: string, userId: string): Promise<Track> {
    return this.resolve(input, guildId, userId);
  }
  async infoResults(
    input: string,
    guildId: string,
    userId: string,
    count: number,
  ): Promise<Track[]> {
    if (!Number.isInteger(count) || count < 1 || count > 25)
      throw new MusicError('INVALID_QUERY', 'Choose 1 to 25 search results.');
    const result = await this.client.parse(
      input,
      guildId,
      userId,
      undefined,
      count,
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
    );
    return { queued: input.tracks.length };
  }

  queue(guildId: string): QueueSnapshot {
    return this.client.getQueue(guildId);
  }

  playback(guildId: string) {
    return this.client.getPlayback(guildId);
  }

  previous(guildId: string) {
    return this.client.previous(guildId);
  }

  pause(guildId: string) {
    return this.client.pause(guildId);
  }

  resume(guildId: string) {
    return this.client.resume(guildId);
  }

  skip(guildId: string) {
    return this.client.skip(guildId);
  }

  stop(guildId: string) {
    return this.client.stop(guildId);
  }

  async disconnect(guildId: string): Promise<void> {
    await this.client.disconnectVoice(guildId);
    this.channels.delete(guildId);
  }

  forgetVoiceChannel(guildId: string): void {
    this.channels.delete(guildId);
  }

  voiceChannel(guildId: string): string | undefined {
    return this.channels.get(guildId);
  }
}
