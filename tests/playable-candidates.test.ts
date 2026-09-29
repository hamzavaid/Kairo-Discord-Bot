import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine, type Track } from '@kairo/music-engine';

const videoId = 'dQw4w9WgXcQ';
function source(provider: string, title = 'Example Song'): Track {
  return {
    id: `${provider}:source`,
    sourceId: 'source',
    sourceProvider: provider,
    title,
    artists: [{ name: 'Example Artist' }],
    durationMs: 180_000,
    isLive: false,
    requestedBy: 'user',
    createdAt: new Date('2026-01-01'),
    provenance: { input: title, parsedBy: provider },
  };
}

function video(title = 'Example Song') {
  return {
    id: videoId,
    title,
    duration: 180_000,
    channel: { name: 'Example Artist - Topic' },
    live: false,
  };
}

describe('playable candidate preparation', () => {
  for (const provider of ['spotify', 'musicbrainz']) {
    it(`${provider} metadata searches YouTube and records the verified match`, async () => {
      const search = vi.fn(async () => [
        video('Example Song (Official Audio)'),
      ]);
      const engine = createKairoMusicEngine({ youtubeSr: { search } });
      const matched = await engine.preparePlayable(source(provider));
      expect(search).toHaveBeenCalledWith('Example Artist Example Song', {
        limit: 10,
      });
      expect(matched.sourceProvider).toBe('youtube-sr');
      expect(matched.sourceId).toBe(videoId);
      expect(matched.provenance).toMatchObject({
        originalSourceProvider: provider,
        candidateSearchProvider: 'youtube-sr',
        selectedCandidateId: videoId,
        selectedProviderId: 'youtube-sr',
        streamProvider: 'yt-dlp',
      });
      expect(matched.provenance.confidence).toBeGreaterThanOrEqual(0.82);
      await engine.shutdown();
    });
  }

  it('reuses a validated YouTube video without candidate search', async () => {
    const search = vi.fn(async () => [video()]);
    const engine = createKairoMusicEngine({ youtubeSr: { search } });
    const original = { ...source('youtube-api'), sourceId: videoId };
    const playable = await engine.preparePlayable(original);
    expect(search).not.toHaveBeenCalled();
    expect(playable.sourceId).toBe(videoId);
    expect(playable.provenance).toMatchObject({
      originalSourceProvider: 'youtube-api',
      streamProvider: 'yt-dlp',
    });
    await engine.shutdown();
  });

  it('rejects low-confidence candidates instead of queuing the first result', async () => {
    const engine = createKairoMusicEngine({
      youtubeSr: { search: async () => [video('Unrelated')] },
    });
    await expect(
      engine.preparePlayable(source('spotify')),
    ).rejects.toMatchObject({ code: 'NO_RELIABLE_MATCH' });
    await engine.shutdown();
  });

  it('rejects malformed YouTube identities before stream resolution', async () => {
    const engine = createKairoMusicEngine();
    await expect(
      engine.preparePlayable({ ...source('youtube-sr'), sourceId: 'bad' }),
    ).rejects.toMatchObject({ code: 'STREAM_UNAVAILABLE' });
    await engine.shutdown();
  });
});
