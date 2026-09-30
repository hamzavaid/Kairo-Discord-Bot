import type { KairoMusicEngine } from '@kairo/music-engine';

interface PlaybackLogger {
  info(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

/** Playback can fail after a slash command has already acknowledged the queue. */
export function logPlaybackEvents(
  engine: Pick<KairoMusicEngine, 'on'>,
  logger: PlaybackLogger,
): void {
  engine.on('playbackSourceSelected', (event) =>
    logger.info(
      {
        guildId: event.guildId,
        generation: event.generation,
        metadataProvider: event.metadataProvider,
        streamProvider: event.streamProvider,
        audioQuality: event.audioQuality,
      },
      'Playback source selected',
    ),
  );
  engine.on('playbackFailed', (event) =>
    logger.error(
      {
        guildId: event.guildId,
        generation: event.generation,
        code: event.code,
      },
      'Playback failed',
    ),
  );
}
