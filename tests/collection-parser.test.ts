import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { classifyQuery } from '../packages/music-engine/src/parser/QueryClassifier.js';

const context = {
  guildId: 'guild',
  requestedBy: 'user',
  allowCollections: true,
};
const youtubeUrl = 'https://www.youtube.com/playlist?list=PLabcdefghijk';
const spotifyId = 'a'.repeat(22);
const video = (id: string, title: string) => ({
  id,
  title,
  duration: 180000,
  channel: { name: 'Artist' },
});
const song = (id: string, name: string) => ({
  id,
  name,
  duration_ms: 180000,
  artists: [{ name: 'Artist' }],
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });

describe('provider-neutral ordered collection parsing', () => {
  it('preserves YouTube API playlist order across pages and skips unavailable videos', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('playlistItems'))
        return json(
          url.searchParams.get('pageToken')
            ? {
                items: [{ contentDetails: { videoId: 'cdefghijklm' } }],
                pageInfo: { totalResults: 3 },
              }
            : {
                items: [
                  { contentDetails: { videoId: 'abcdefghijk' } },
                  { contentDetails: { videoId: 'bcdefghijkl' } },
                ],
                nextPageToken: 'second',
                pageInfo: { totalResults: 3 },
              },
        );
      const ids = url.searchParams.get('id')!.split(',');
      return json({
        items: ids
          .filter((id) => id !== 'bcdefghijkl')
          .reverse()
          .map((id) => ({
            id,
            snippet: { title: id, channelTitle: 'Artist' },
            contentDetails: { duration: 'PT3M' },
          })),
      });
    });
    const engine = createKairoMusicEngine({
      metadataProvider: 'youtube-api',
      youtubeApi: { apiKey: 'key', fetcher: fetcher as typeof fetch },
    });
    const result = await engine.parse({ ...context, input: youtubeUrl });
    expect(result).toMatchObject({
      kind: 'collection',
      collection: {
        tracks: [{ sourceId: 'abcdefghijk' }, { sourceId: 'cdefghijklm' }],
        importSummary: { imported: 2, skipped: 1, total: 3 },
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    await engine.shutdown();
  });
  it('cancels a pending collection request without producing a partial success', async () => {
    const abort = new AbortController();
    const engine = createKairoMusicEngine({
      youtubeSr: { getPlaylist: () => new Promise(() => {}) },
    });
    const pending = engine.parse({
      ...context,
      input: youtubeUrl,
      signal: abort.signal,
    });
    abort.abort();
    await expect(pending).rejects.toMatchObject({ code: 'PARSER_CANCELLED' });
    await engine.shutdown();
  });
  it('classifies collections explicitly while keeping a watch URL with a video as a track', () => {
    expect(classifyQuery(youtubeUrl)).toMatchObject({
      kind: 'provider-collection',
      resourceType: 'playlist',
    });
    expect(
      classifyQuery(`https://open.spotify.com/album/${spotifyId}`),
    ).toMatchObject({ kind: 'provider-collection', resourceType: 'album' });
    expect(
      classifyQuery(
        'https://www.youtube.com/watch?v=abcdefghijk&list=PLabcdefghijk',
      ).kind,
    ).toBe('provider-track');
  });
  it('normalizes an ordered YouTube collection and accounts for unavailable/invalid entries without streams', async () => {
    const getPlaylist = vi.fn(async () => ({
      title: 'Mix',
      videoCount: 4,
      videos: [
        video('abcdefghijk', 'First'),
        null,
        { id: 'bad' },
        video('bcdefghijkl', 'Second'),
      ],
    }));
    const engine = createKairoMusicEngine({ youtubeSr: { getPlaylist } });
    const result = await engine.parse({ ...context, input: youtubeUrl });
    expect(result.kind).toBe('collection');
    if (result.kind !== 'collection') throw new Error('Expected collection');
    expect(result.collection.tracks.map((t) => t.title)).toEqual([
      'First',
      'Second',
    ]);
    expect(result.collection.importSummary).toMatchObject({
      imported: 2,
      skipped: 1,
      failed: 1,
      total: 4,
      truncated: false,
    });
    expect(result.collection.tracks[0]?.requestedBy).toBe('user');
    expect(result.collection.tracks[0]).not.toHaveProperty('stream');
    await expect(
      engine.parse({ ...context, allowCollections: false, input: youtubeUrl }),
    ).rejects.toMatchObject({ code: 'COLLECTION_UNSUPPORTED' });
    await engine.shutdown();
  });
  it('bounds inspected items and reports truncation', async () => {
    const engine = createKairoMusicEngine({
      maxCollectionItems: 1,
      youtubeSr: {
        getPlaylist: async () => ({
          title: 'Mix',
          videoCount: 20,
          videos: [
            video('abcdefghijk', 'First'),
            video('bcdefghijkl', 'Second'),
          ],
        }),
      },
    });
    const result = await engine.parse({ ...context, input: youtubeUrl });
    expect(result).toMatchObject({
      kind: 'collection',
      collection: {
        tracks: [{ title: 'First' }],
        importSummary: { imported: 1, total: 20, truncated: true },
      },
    });
    await engine.shutdown();
  });
  it('paginates Spotify albums and playlists via the adapter, skipping null/local items', async () => {
    const paths: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      paths.push(url.pathname + url.search);
      if (url.pathname.endsWith('/token'))
        return json({ access_token: 'token', expires_in: 3600 });
      if (url.pathname.endsWith(`/albums/${spotifyId}`))
        return json({ name: 'Album' });
      if (url.pathname.endsWith(`/playlists/${spotifyId}`))
        return json({ name: 'Playlist' });
      if (url.pathname.endsWith('/items'))
        return json({
          items: [
            { item: song('b'.repeat(22), 'First') },
            { item: null },
            { is_local: true, item: song('c'.repeat(22), 'Local') },
          ],
          total: 3,
          next: null,
        });
      const offset = Number(url.searchParams.get('offset'));
      return json(
        offset === 0
          ? {
              items: [song('b'.repeat(22), 'First')],
              total: 2,
              next: 'https://untrusted.invalid/page',
            }
          : { items: [song('c'.repeat(22), 'Second')], total: 2, next: null },
      );
    });
    const engine = createKairoMusicEngine({
      spotify: {
        clientId: 'id',
        clientSecret: 'secret',
        fetcher: fetcher as typeof fetch,
      },
    });
    const album = await engine.parse({
      ...context,
      input: `https://open.spotify.com/album/${spotifyId}`,
    });
    expect(album).toMatchObject({
      kind: 'collection',
      collection: { tracks: [{ title: 'First' }, { title: 'Second' }] },
    });
    const playlist = await engine.parse({
      ...context,
      input: `https://open.spotify.com/playlist/${spotifyId}`,
    });
    expect(playlist).toMatchObject({
      kind: 'collection',
      collection: {
        tracks: [{ title: 'First' }],
        importSummary: { skipped: 2 },
      },
    });
    expect(paths.some((p) => p.includes('offset=1'))).toBe(true);
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes('untrusted.invalid'),
      ),
    ).toBe(false);
    await engine.shutdown();
  });
  it('keeps valid earlier pages on a later provider failure, and rejects unsupported/empty collections', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/token'))
        return json({ access_token: 'token', expires_in: 3600 });
      if (url.pathname.endsWith(`/albums/${spotifyId}`))
        return json({ name: 'Album' });
      if (url.searchParams.get('offset') === '0')
        return json({
          items: [song('b'.repeat(22), 'First')],
          total: 3,
          next: 'next',
        });
      return new Response('', { status: 503 });
    });
    const engine = createKairoMusicEngine({
      spotify: {
        clientId: 'id',
        clientSecret: 'secret',
        fetcher: fetcher as typeof fetch,
      },
    });
    expect(
      await engine.parse({
        ...context,
        input: `https://open.spotify.com/album/${spotifyId}`,
      }),
    ).toMatchObject({
      kind: 'collection',
      collection: { importSummary: { imported: 1, failed: 2, partial: true } },
    });
    await expect(
      engine.parse({
        ...context,
        input:
          'https://musicbrainz.org/release/12345678-1234-1234-1234-123456789012',
      }),
    ).rejects.toMatchObject({ code: 'COLLECTION_UNSUPPORTED' });
    const empty = createKairoMusicEngine({
      youtubeSr: {
        getPlaylist: async () => ({
          title: 'Empty',
          videos: [],
          videoCount: 0,
        }),
      },
    });
    await expect(
      empty.parse({ ...context, input: youtubeUrl }),
    ).rejects.toMatchObject({ code: 'COLLECTION_EMPTY' });
    await Promise.all([engine.shutdown(), empty.shutdown()]);
  });
});
