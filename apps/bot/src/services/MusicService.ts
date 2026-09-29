import {
  MusicError,
  type QueueSnapshot,
  type Track,
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
    const track = await this.resolve(query, guildId, userId);
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

  queue(guildId: string): QueueSnapshot {
    return this.client.getQueue(guildId);
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
