import { describe, expect, it, vi } from 'vitest';
import {
  LyricsService,
  LrcLibLyricsProvider,
} from '../apps/bot/src/services/LyricsService.js';
import { libraryTrack } from './helpers/libraryModel.js';
describe('isolated bounded lyrics discovery', () => {
  it('normalizes plain/synchronized lyrics and identifies instrumentals without persistence', async () => {
    const fetch = vi.fn(
      async (
        _input: Parameters<typeof globalThis.fetch>[0],
        _options?: RequestInit,
      ) => {
        void _options;
        void _input;
        return new Response(
          JSON.stringify({
            instrumental: false,
            plainLyrics: 'First line\nSecond line',
            syncedLyrics: '[00:01.00]First line',
          }),
        );
      },
    );
    const provider = new LrcLibLyricsProvider(fetch);
    expect(await provider.get(libraryTrack as never)).toMatchObject({
      kind: 'lyrics',
      text: 'First line\nSecond line',
      provider: 'lrclib',
    });
    expect(fetch.mock.calls[0]?.[0]).toContain('artist_name=Artist');
    const instrumental = new LrcLibLyricsProvider(
      async () => new Response(JSON.stringify({ instrumental: true })),
    );
    expect(await instrumental.get(libraryTrack as never)).toEqual({
      kind: 'instrumental',
      provider: 'lrclib',
    });
  });
  it('distinguishes not found from failure and supports explicit provider fallback', async () => {
    const notfound = new LrcLibLyricsProvider(
      async () => new Response('', { status: 404 }),
    );
    expect(await notfound.get(libraryTrack as never)).toEqual({
      kind: 'not-found',
      provider: 'lrclib',
    });
    const service = new LyricsService([
      {
        id: 'broken',
        get: async () => {
          throw new Error('private provider data');
        },
      },
      {
        id: 'fixture',
        get: async () => ({
          kind: 'lyrics',
          provider: 'fixture',
          text: 'Fixture',
        }),
      },
    ]);
    expect(await service.get(libraryTrack as never)).toMatchObject({
      text: 'Fixture',
    });
    await expect(
      new LyricsService([
        {
          id: 'broken',
          get: async () => {
            throw Error('secret');
          },
        },
      ]).get(libraryTrack as never),
    ).rejects.toMatchObject({ code: 'LYRICS_PROVIDER_UNAVAILABLE' });
  });
  it('honors cancellation, bounds responses and strips sync timestamps when only timed lyrics are available', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new LrcLibLyricsProvider(vi.fn()).get(
        libraryTrack as never,
        controller.signal,
      ),
    ).rejects.toThrow();
    await expect(
      new LrcLibLyricsProvider(
        async () => new Response('x'.repeat(100000)),
      ).get(libraryTrack as never),
    ).rejects.toThrow();
    const timed = new LrcLibLyricsProvider(
      async () =>
        new Response(
          JSON.stringify({ syncedLyrics: '[00:01.00]Hello\n[00:02.00]World' }),
        ),
    );
    expect(await timed.get(libraryTrack as never)).toMatchObject({
      text: 'Hello\nWorld',
    });
  });
});
