import { describe, expect, it, vi } from 'vitest';
import type { KairoMusicEngine, KairoMusicEvent } from '@kairo/music-engine';
import { logPlaybackEvents } from '../apps/bot/src/services/logPlaybackEvents.js';

describe('playback diagnostics', () => {
  it('logs safe source selection and asynchronous failures', () => {
    const listeners = new Map<string, (event: KairoMusicEvent) => void>();
    const engine = {
      on: vi.fn((type: string, listener: (event: KairoMusicEvent) => void) => {
        listeners.set(type, listener);
        return () => listeners.delete(type);
      }),
    } as unknown as Pick<KairoMusicEngine, 'on'>;
    const logger = { info: vi.fn(), error: vi.fn() };
    logPlaybackEvents(engine, logger);

    listeners.get('playbackSourceSelected')?.({
      type: 'playbackSourceSelected',
      guildId: 'guild',
      generation: 2,
      trackId: 'track',
      metadataProvider: 'youtube-sr',
      selectedCandidateId: 'K0HSD_i2DvA',
      streamProvider: 'yt-dlp',
      audioQuality: 'high',
    });
    listeners.get('playbackFailed')?.({
      type: 'playbackFailed',
      guildId: 'guild',
      generation: 2,
      code: 'STREAM_UNAVAILABLE',
    });

    expect(logger.info).toHaveBeenCalledWith(
      {
        guildId: 'guild',
        generation: 2,
        metadataProvider: 'youtube-sr',
        streamProvider: 'yt-dlp',
        audioQuality: 'high',
      },
      'Playback source selected',
    );
    expect(logger.error).toHaveBeenCalledWith(
      { guildId: 'guild', generation: 2, code: 'STREAM_UNAVAILABLE' },
      'Playback failed',
    );
  });
});
