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
    signal?: AbortSignal,
  ): Promise<ParseResult> {
    return this.engine.parse({
      input,
      guildId,
      requestedBy,
      ...(allowCollections === undefined ? {} : { allowCollections }),
      ...(maxResults === undefined ? {} : { maxResults }),
      ...(signal ? { signal } : {}),
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

  searchQueue(guildId: string, query: string) {
    return this.engine.searchQueue(guildId, query);
  }
  removeEntry(guildId: string, entryId: string, expectedGeneration?: number) {
    return this.engine.remove({
      guildId,
      entryId,
      ...(expectedGeneration === undefined ? {} : { expectedGeneration }),
    });
  }
  moveEntry(
    guildId: string,
    entryId: string,
    toEntryId: string,
    expectedGeneration?: number,
  ) {
    return this.engine.move({
      guildId,
      entryId,
      toEntryId,
      to: 1,
      ...(expectedGeneration === undefined ? {} : { expectedGeneration }),
    });
  }
  clearQueue(guildId: string, expectedGeneration?: number) {
    return this.engine.clear(guildId, expectedGeneration);
  }
  getQueue(guildId: string): QueueSnapshot {
    return this.engine.getQueue(guildId);
  }

  setVolume(
    guildId: string,
    volume: number,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot> {
    return this.engine.setVolume(
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
    return this.engine.setFilter(
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
    return this.engine.setRepeat(
      guildId,
      mode,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }
  pause(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot> {
    return this.engine.pause(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  resume(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot> {
    return this.engine.resume(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  skip(guildId: string, expectedGeneration?: number): Promise<QueueSnapshot> {
    return this.engine.skip(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  shuffle(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<QueueSnapshot> {
    return this.engine.shuffle(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  previous(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<QueueSnapshot> {
    return this.engine.previous(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  stop(guildId: string, expectedGeneration?: number): Promise<QueueSnapshot> {
    return this.engine.stop(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }

  acquirePreview(target: VoiceTarget, ownerId: string) {
    return this.engine.acquirePreview(target, ownerId);
  }
  playPreview(request: Parameters<KairoMusicEngine['playPreview']>[0]) {
    return this.engine.playPreview(request);
  }
  stopPreview(guildId: string, leaseId: string) {
    return this.engine.stopPreview(guildId, leaseId);
  }
  releasePreview(guildId: string, leaseId: string) {
    return this.engine.releasePreview(guildId, leaseId);
  }
  disconnectVoice(
    guildId: string,
    expectedGeneration?: number,
  ): Promise<PlaybackSnapshot> {
    return this.engine.disconnectVoice(
      guildId,
      ...(expectedGeneration === undefined ? [] : [expectedGeneration]),
    );
  }
}
