import { expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { parseEnvironment } from '@kairo/shared';
import { createBotMusicOptions } from '../apps/bot/src/config/music.js';

const id = '4wMTgTg3OUc2buJx7clORO';
const request = {
  input: `https://open.spotify.com/playlist/${id}`,
  guildId: 'guild',
  requestedBy: 'user',
  allowCollections: true,
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
it.each([401, 403])(
  'preserves Spotify playlist HTTP %i with a safe typed error and no raw payload',
  async (status) => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/token'))
        return json({ access_token: 'secret-access', expires_in: 3600 });
      if (path.endsWith(`/playlists/${id}`)) return json({ name: 'Mix' });
      return new Response('secret-provider-response', { status });
    });
    const engine = createKairoMusicEngine({
      spotify: {
        clientId: 'id',
        clientSecret: 'secret',
        fetcher: fetcher as typeof fetch,
      },
    });
    try {
      let caught: unknown;
      try {
        await engine.parse(request);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        code:
          status === 401 ? 'PROVIDER_AUTH_REQUIRED' : 'PROVIDER_ACCESS_DENIED',
        diagnostics: {
          provider: 'spotify',
          operation: 'playlist-items',
          httpStatus: status,
        },
      });
      expect(JSON.stringify(caught)).not.toContain('secret');
    } finally {
      await engine.shutdown();
    }
  },
);
it('uses configured user refresh authorization, caches access tokens and retains collection order', async () => {
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/token')) {
        expect(String(init?.body)).toContain('grant_type=refresh_token');
        expect(
          new URLSearchParams(String(init?.body)).get('refresh_token'),
        ).toBe('user-refresh');
        return json({ access_token: 'user-access', expires_in: 3600 });
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer user-access',
      );
      if (url.pathname.endsWith(`/playlists/${id}`)) {
        expect(url.searchParams.get('fields')).toBe('name');
        return json({ name: 'Mix' });
      }
      return json({
        items: [
          {
            item: {
              id: 'a'.repeat(22),
              name: 'Song',
              artists: [{ name: 'Artist' }],
              duration_ms: 180000,
            },
          },
        ],
        total: 1,
        next: null,
      });
    },
  );
  const engine = createKairoMusicEngine({
    spotify: {
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'user-refresh',
      fetcher: fetcher as typeof fetch,
    },
  });
  try {
    expect(await engine.parse(request)).toMatchObject({
      kind: 'collection',
      collection: { tracks: [{ title: 'Song' }] },
    });
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes('/api/token')),
    ).toHaveLength(1);
  } finally {
    await engine.shutdown();
  }
});
it('passes optional Spotify user authorization from validated configuration', () => {
  const env = parseEnvironment({
    DISCORD_TOKEN: 'test',
    DISCORD_CLIENT_ID: '123456789012345678',
    MONGODB_URI: 'mongodb://localhost/kairo',
    SPOTIFY_CLIENT_ID: 'id',
    SPOTIFY_CLIENT_SECRET: 'secret',
    SPOTIFY_REFRESH_TOKEN: 'user-refresh',
  });
  expect(createBotMusicOptions(env).spotify).toMatchObject({
    refreshToken: 'user-refresh',
  });
});

it('refreshes a rejected user access token once and persists replacement refresh tokens', async () => {
  let tokenCalls = 0;
  let itemCalls = 0;
  const onRefreshToken = vi.fn(async () => {});
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/token'))
      return json({
        access_token: `user-${++tokenCalls}`,
        refresh_token: `rotated-${tokenCalls}`,
        expires_in: 3600,
      });
    if (path.endsWith(`/playlists/${id}`)) return json({ name: 'Mix' });
    if (++itemCalls === 1) return new Response('', { status: 401 });
    return json({
      items: [
        {
          item: {
            id: 'a'.repeat(22),
            name: 'Song',
            artists: [{ name: 'Artist' }],
            duration_ms: 180000,
          },
        },
      ],
      total: 1,
      next: null,
    });
  });
  const engine = createKairoMusicEngine({
    spotify: {
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'user-refresh',
      onRefreshToken,
      fetcher: fetcher as typeof fetch,
    },
  });
  try {
    expect(await engine.parse(request)).toMatchObject({ kind: 'collection' });
    expect(tokenCalls).toBe(2);
    expect(itemCalls).toBe(2);
    expect(onRefreshToken).toHaveBeenLastCalledWith('rotated-2');
  } finally {
    await engine.shutdown();
  }
});
it('never silently downgrades failed user authorization to app credentials', async () => {
  const fetcher = vi.fn(
    async () => new Response('secret invalid grant payload', { status: 400 }),
  );
  const engine = createKairoMusicEngine({
    spotify: {
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'expired-refresh',
      fetcher: fetcher as typeof fetch,
    },
  });
  try {
    await expect(engine.parse(request)).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_REQUIRED',
      diagnostics: { provider: 'spotify', operation: 'token', httpStatus: 400 },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  } finally {
    await engine.shutdown();
  }
});
