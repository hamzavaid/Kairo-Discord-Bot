import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { rankMusicSearchResults } from '../packages/music-engine/src/providers/metadata/musicSearchRanking.js';
import type { ProviderTrack } from '../packages/music-engine/src/providers/MediaProvider.js';

const song: ProviderTrack = {
  sourceId: 'MM0yi-Op4h8',
  title: 'brakence - ready or noT (official video)',
  artists: [{ name: 'brakence' }],
  durationMs: 254000,
};
const gaming: ProviderTrack = {
  sourceId: 'Uy-nlcmYWjY',
  title: "Ready Or Not - can't catch a brake",
  artists: [{ name: 'ArminIsReady' }],
  durationMs: 47000,
};
const track = (
  id: string,
  title: string,
  artist = 'Artist',
): ProviderTrack => ({ sourceId: id, title, artists: [{ name: artist }] });
const context = { guildId: 'guild', requestedBy: 'user' };
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });

describe('music-aware YouTube discovery', () => {
  it('ranks the reported song above a general video without hardcoding its ID', () => {
    expect(
      rankMusicSearchResults('ready or noT brake', [gaming, song])[0],
    ).toBe(song);
    expect(
      rankMusicSearchResults('READY OR NOT BRAKE', [gaming, song])[0],
    ).toBe(song);
  });
  it('uses title and artist relevance, not music labels alone', () => {
    const unrelated = track(
      'unrelated',
      'Other Song (Official Music Video)',
      'Other Artist',
    );
    const topic = track('topic', 'Night Drive', 'Artist - Topic');
    expect(
      rankMusicSearchResults('Artist Night Drive', [unrelated, topic])[0],
    ).toBe(topic);
  });
  it('demotes commentary and unrequested alternate versions but honors explicit requests', () => {
    const original = track('original', 'Artist - Night Drive (Official Audio)');
    const cover = track('cover', 'Artist - Night Drive (Cover)');
    const reaction = track(
      'reaction',
      'Artist - Night Drive Official Audio Reaction',
    );
    expect(
      rankMusicSearchResults('Artist Night Drive', [
        reaction,
        cover,
        original,
      ])[0],
    ).toBe(original);
    expect(
      rankMusicSearchResults('Artist Night Drive cover', [original, cover])[0],
    ).toBe(cover);
  });
  it('preserves exact token matches ahead of artist prefixes and stable ties without mutating input', () => {
    const prefix = track('prefix', 'Night Drive', 'Artists');
    const exact = track('exact', 'Night Drive', 'Artist');
    const other = { ...exact, sourceId: 'other' };
    const input = [prefix, exact, other];
    expect(rankMusicSearchResults('Artist Night Drive', input)).toEqual([
      exact,
      other,
      prefix,
    ]);
    expect(input).toEqual([prefix, exact, other]);
  });
  it('does not punish long music or missing duration, and removes duplicate resources', () => {
    const long = {
      ...track('long', 'Symphony (Official Audio)'),
      durationMs: 3600000,
    };
    expect(rankMusicSearchResults('Symphony', [long, long])).toEqual([long]);
    expect(
      rankMusicSearchResults('Night Drive', [track('missing', 'Night Drive')]),
    ).toHaveLength(1);
  });
  it('youtube-sr searches a bounded candidate pool before applying a one-result limit', async () => {
    const search = vi.fn(async () =>
      [gaming, song].map((t) => ({
        id: t.sourceId,
        title: t.title,
        channel: { name: t.artists[0]!.name },
        duration: t.durationMs,
      })),
    );
    const engine = createKairoMusicEngine({ youtubeSr: { search } });
    expect(
      await engine.parse({
        ...context,
        input: 'ready or noT brake',
        maxResults: 1,
      }),
    ).toMatchObject({
      kind: 'search',
      candidates: [{ sourceId: song.sourceId }],
    });
    expect(search).toHaveBeenCalledWith('ready or noT brake', { limit: 25 });
    await engine.shutdown();
  });
  it('YouTube API shares ranking, bounded retrieval and cache with no additional search requests', async () => {
    const fixtures = [gaming, song];
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('/search?')
        ? json({
            items: fixtures.map((t) => ({ id: { videoId: t.sourceId } })),
          })
        : json({
            items: fixtures.map((t) => ({
              id: t.sourceId,
              snippet: { title: t.title, channelTitle: t.artists[0]!.name },
              contentDetails: { duration: 'PT4M' },
            })),
          }),
    );
    const engine = createKairoMusicEngine({
      metadataProvider: 'youtube-api',
      youtubeApi: { apiKey: 'fixture', fetcher },
    });
    for (let i = 0; i < 2; i++)
      expect(
        await engine.parse({
          ...context,
          input: 'ready or noT brake',
          maxResults: 1,
        }),
      ).toMatchObject({
        kind: 'search',
        candidates: [{ sourceId: song.sourceId }],
      });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get('maxResults')).toBe('25');
    expect(url.searchParams.get('q')).toBe('ready or noT brake');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await engine.shutdown();
  });
});
