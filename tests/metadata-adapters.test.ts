import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';

const context = { guildId: 'guild', requestedBy: 'user' };
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });

describe('metadata adapter fixtures', () => {
  it('normalizes youtube-sr search and URL lookup without API credentials', async () => {
    const video = {
      id: 'abc12345678',
      title: 'Night Drive',
      channel: { name: 'Artist' },
      duration: 210000,
      thumbnail: { url: 'https://example.com/art.jpg' },
    };
    const search = vi.fn(async () => [video]);
    const getVideo = vi.fn(async () => video);
    const engine = createKairoMusicEngine({ youtubeSr: { search, getVideo } });
    expect(
      await engine.parse({ ...context, input: 'Night Drive' }),
    ).toMatchObject({
      kind: 'search',
      candidates: [
        {
          id: 'youtube-sr:abc12345678',
          durationMs: 210000,
          artworkUrl: 'https://example.com/art.jpg',
        },
      ],
    });
    expect(
      await engine.parse({ ...context, input: 'https://youtu.be/abc12345678' }),
    ).toMatchObject({
      kind: 'track',
      track: { sourceProvider: 'youtube-sr', sourceId: 'abc12345678' },
    });
    expect(getVideo).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc12345678',
    );
  });

  it('normalizes YouTube API search and lookup, caches search, and reports quota calls', async () => {
    const id = 'abc12345678';
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('/search?')
        ? json({ items: [{ id: { videoId: id } }] })
        : json({
            items: [
              {
                id,
                snippet: {
                  title: 'Night Drive',
                  channelTitle: 'Artist',
                  thumbnails: { high: { url: 'https://example.com/art.jpg' } },
                },
                contentDetails: { duration: 'PT3M30S' },
              },
            ],
          }),
    );
    const onQuotaUse = vi.fn();
    const engine = createKairoMusicEngine({
      metadataProvider: 'youtube-api',
      youtubeApi: { apiKey: 'test-key', fetcher, onQuotaUse },
    });
    const first = await engine.parse({ ...context, input: 'Night Drive' });
    await engine.parse({ ...context, input: 'Night Drive' });
    expect(first).toMatchObject({
      kind: 'search',
      candidates: [{ id: `youtube-api:${id}`, durationMs: 210000 }],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onQuotaUse.mock.calls).toEqual([
      ['search', 1],
      ['videos', 1],
    ]);
    await engine.parse({
      ...context,
      input: `https://www.youtube.com/watch?v=${id}`,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('normalizes Spotify search and track lookup and reuses its token', async () => {
    const id = '1234567890123456789012';
    const track = {
      id,
      name: 'Night Drive',
      duration_ms: 210000,
      artists: [{ id: 'artist-1', name: 'Artist' }],
      album: {
        id: 'album-1',
        name: 'Album',
        images: [{ url: 'https://example.com/art.jpg' }],
      },
      explicit: false,
      external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    };
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('/api/token')
        ? json({ access_token: 'token', expires_in: 3600 })
        : String(input).includes('/search?')
          ? json({ tracks: { items: [track] } })
          : json(track),
    );
    const engine = createKairoMusicEngine({
      metadataProvider: 'spotify',
      spotify: { clientId: 'id', clientSecret: 'secret', fetcher },
    });
    expect(
      await engine.parse({ ...context, input: 'Night Drive' }),
    ).toMatchObject({
      kind: 'search',
      candidates: [
        {
          id: `spotify:${id}`,
          album: { title: 'Album', id: 'album-1' },
          explicit: false,
        },
      ],
    });
    expect(
      await engine.parse({
        ...context,
        input: `https://open.spotify.com/track/${id}`,
      }),
    ).toMatchObject({
      kind: 'track',
      track: {
        sourceProvider: 'spotify',
        canonicalUrl: `https://open.spotify.com/track/${id}`,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('maps malformed provider data and cancellation into typed errors', async () => {
    const engine = createKairoMusicEngine({
      youtubeSr: { search: async () => [{ bad: true }] },
    });
    await expect(
      engine.parse({ ...context, input: 'bad', requestId: 'r1' }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_PARSE_ERROR',
      correlationId: 'r1',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      engine.parse({ ...context, input: 'bad', signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'PARSER_CANCELLED' });
  });

  it('times out a stalled official API transport even when it ignores abort', async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const engine = createKairoMusicEngine({
      metadataProvider: 'youtube-api',
      youtubeApi: { apiKey: 'test-key', fetcher, timeoutMs: 10 },
    });
    await expect(
      engine.parse({ ...context, input: 'stalled' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', retryable: true });
  });
});
