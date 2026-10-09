import type {
  KairoMusicEngine,
  ParseResult,
  QueueSnapshot,
  PlaybackSnapshot,
  Track,
  VoiceTarget,
} from '@kairo/music-engine';

/** Discord application adapter; engine internals stay behind the package entry point. */
export class KairoMusicClient {
  constructor(private readonly engine: KairoMusicEngine) {}

  parse(
    input: string,
    guildId: string,
    requestedBy: string,
    allowCollections?: boolean,
    maxResults?: number,
  ): Promise<ParseResult> {
    return this.engine.parse({
      input,
      guildId,
      requestedBy,
      ...(allowCollections === undefined ? {} : { allowCollections }),
      ...(maxResults === undefined ? {} : { maxResults }),
    });
  }
  enqueueMany(
    guildId: string,
    tracks: Track[],
    enqueuedBy: string,
    position?: 'next' | 'last',
  ): Promise<QueueSnapshot> {
    return this.engine.enqueueMany({
      guildId,
      tracks,
      enqueuedBy,
      ...(position === undefined ? {} : { position }),
    });
  }

  preparePlayable(track: Track): Promise<Track> {
    return this.engine.preparePlayable(track);
  }

  canPlay(track: Track): boolean {
    return this.engine.canPlay(track);
  }

  enqueue(
    guildId: string,
    track: Track,
    enqueuedBy: string,
    position?: 'next' | 'last',
  ): Promise<QueueSnapshot> {
    return this.engine.enqueue({
      guildId,
      track,
      enqueuedBy,
      ...(position === undefined ? {} : { position }),
    });
  }

  connectVoice(target: VoiceTarget): Promise<PlaybackSnapshot> {
    return this.engine.connectVoice(target);
  }

  getPlayback(guildId: string): PlaybackSnapshot {
    return this.engine.getPlayback(guildId);
  }

  getQueue(guildId: string): QueueSnapshot {
    return this.engine.getQueue(guildId);
  }

  pause(guildId: string): Promise<PlaybackSnapshot> {
    return this.engine.pause(guildId);
  }

  resume(guildId: string): Promise<PlaybackSnapshot> {
    return this.engine.resume(guildId);
  }

  skip(guildId: string): Promise<QueueSnapshot> {
    return this.engine.skip(guildId);
  }

  shuffle(guildId: string): Promise<QueueSnapshot> {
    return this.engine.shuffle(guildId);
  }

  previous(guildId: string): Promise<QueueSnapshot> {
    return this.engine.previous(guildId);
  }

  stop(guildId: string): Promise<QueueSnapshot> {
    return this.engine.stop(guildId);
  }

  disconnectVoice(guildId: string): Promise<PlaybackSnapshot> {
    return this.engine.disconnectVoice(guildId);
  }
}
