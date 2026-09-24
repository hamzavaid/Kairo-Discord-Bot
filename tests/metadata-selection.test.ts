import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';

const request = { input: 'Night Drive', guildId: 'guild', requestedBy: 'user' };
const track = {
  id: 'video123456',
  title: 'Night Drive',
  channel: { name: 'Artist' },
  duration: 213000,
};

describe('metadata provider selection', () => {
  it('defaults to youtube-sr and does not call authenticated providers', async () => {
    const search = vi.fn(async () => [track]);
    const engine = createKairoMusicEngine({ youtubeSr: { search } });
    const result = await engine.parse(request);
    expect(search).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      kind: 'search',
      candidates: [{ sourceProvider: 'youtube-sr' }],
    });
  });

  it('selects an explicit provider and fails fast when its credentials are absent', () => {
    expect(() =>
      createKairoMusicEngine({ metadataProvider: 'youtube-api' }),
    ).toThrow(/YOUTUBE_API_KEY/);
    expect(() =>
      createKairoMusicEngine({ metadataProvider: 'spotify' }),
    ).toThrow(/SPOTIFY_CLIENT/);
    expect(() =>
      createKairoMusicEngine({ metadataProvider: 'musicbrainz' }),
    ).toThrow(/MUSICBRAINZ_USER_AGENT/);
  });

  it('uses configured fallback order and never falls back implicitly', async () => {
    const srSearch = vi.fn(async () => [track]);
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('spotify'))
        return new Response('{}', { status: 503 });
      return new Response(
        readFileSync(
          join(import.meta.dirname, 'fixtures/musicbrainz/search.json'),
          'utf8',
        ),
        { headers: { 'content-type': 'application/json' } },
      );
    });
    const options = {
      metadataProvider: 'spotify' as const,
      spotify: { clientId: 'id', clientSecret: 'secret', fetcher },
      musicBrainz: {
        contact: 'https://example.com/contact',
        fetcher,
        minIntervalMs: 0,
        maxAttempts: 1,
      },
      youtubeSr: { search: srSearch },
    };
    const noFallback = createKairoMusicEngine(options);
    await expect(noFallback.parse(request)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(srSearch).not.toHaveBeenCalled();
    const fallback = createKairoMusicEngine({
      ...options,
      fallbackProviders: ['musicbrainz', 'youtube-sr'],
    });
    const result = await fallback.parse({ ...request, maxResults: 1 });
    expect(result).toMatchObject({
      kind: 'search',
      candidates: [{ sourceProvider: 'musicbrainz' }],
    });
    expect(srSearch).not.toHaveBeenCalled();
  });

  it('rejects unavailable configured fallback credentials during construction', () => {
    expect(() =>
      createKairoMusicEngine({ fallbackProviders: ['spotify'] }),
    ).toThrow(/SPOTIFY_CLIENT/);
  });

  it('continues to the next fallback only after the previous provider fails', async () => {
    const search = vi.fn(async () => [
      { id: 'abc12345678', title: 'Night Drive', channel: { name: 'Artist' } },
    ]);
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/api/token')
        ? new Response(
            JSON.stringify({ access_token: 'token', expires_in: 3600 }),
            { headers: { 'content-type': 'application/json' } },
          )
        : new Response('{}', { status: 503 }),
    );
    const engine = createKairoMusicEngine({
      metadataProvider: 'spotify',
      fallbackProviders: ['youtube-sr'],
      spotify: { clientId: 'id', clientSecret: 'secret', fetcher },
      youtubeSr: { search },
    });
    expect(await engine.parse(request)).toMatchObject({
      kind: 'search',
      candidates: [{ sourceProvider: 'youtube-sr' }],
    });
    expect(search).toHaveBeenCalledOnce();
  });
});
