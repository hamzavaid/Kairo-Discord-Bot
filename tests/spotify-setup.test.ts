import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  SPOTIFY_CALLBACK_URI,
  spotifyAuthorizationUrl,
  spotifyCallbackCode,
  exchangeSpotifyCode,
  saveSpotifyRefreshToken,
} from '../apps/bot/src/config/spotifyAuthorization.js';
it('requests only playlist read scopes and validates callback state and URI', () => {
  const url = new URL(spotifyAuthorizationUrl('client', 'expected-state'));
  expect(url.origin).toBe('https://accounts.spotify.com');
  expect(url.searchParams.get('scope')).toBe(
    'playlist-read-private playlist-read-collaborative',
  );
  expect(url.searchParams.get('redirect_uri')).toBe(SPOTIFY_CALLBACK_URI);
  expect(
    spotifyCallbackCode(
      `${SPOTIFY_CALLBACK_URI}?state=expected-state&code=authorized-code`,
      'expected-state',
    ),
  ).toBe('authorized-code');
  for (const callback of [
    `${SPOTIFY_CALLBACK_URI}?state=bad&code=secret`,
    `${SPOTIFY_CALLBACK_URI}?state=expected-state&error=access_denied`,
    'https://untrusted.invalid/callback?state=expected-state&code=secret',
  ])
    expect(() => spotifyCallbackCode(callback, 'expected-state')).toThrow();
});
it('exchanges consent code without exposing access tokens or raw errors', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          access_token: 'access-secret',
          refresh_token: 'refresh-secret',
        }),
      ),
  );
  expect(
    await exchangeSpotifyCode(
      'client',
      'secret',
      'code',
      fetcher as typeof fetch,
    ),
  ).toBe('refresh-secret');
  const init = (
    fetcher.mock.calls as unknown as [string, RequestInit][]
  )[0]![1];
  expect(new URLSearchParams(String(init.body)).get('grant_type')).toBe(
    'authorization_code',
  );
  await expect(
    exchangeSpotifyCode(
      'client',
      'secret',
      'code',
      (async () =>
        new Response('raw-secret-error', { status: 400 })) as typeof fetch,
    ),
  ).rejects.toThrow('Spotify authorization failed (HTTP 400).');
});
it('persists refresh tokens in .env while preserving existing configuration and replacing old tokens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kairo-spotify-'));
  const path = join(directory, '.env');
  try {
    await writeFile(
      path,
      '# Existing settings\nSPOTIFY_CLIENT_ID=client\nSPOTIFY_REFRESH_TOKEN=old\nMONGODB_URI=mongodb://localhost/kairo\n',
    );
    await saveSpotifyRefreshToken('new-refresh', path);
    const saved = await readFile(path, 'utf8');
    expect(saved).toContain('SPOTIFY_CLIENT_ID=client');
    expect(saved).toContain('MONGODB_URI=mongodb://localhost/kairo');
    expect(saved).toContain('SPOTIFY_REFRESH_TOKEN="new-refresh"');
    expect(saved.match(/^SPOTIFY_REFRESH_TOKEN=/gm)).toHaveLength(1);
    await expect(
      saveSpotifyRefreshToken('unsafe\nTOKEN=secret', path),
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
