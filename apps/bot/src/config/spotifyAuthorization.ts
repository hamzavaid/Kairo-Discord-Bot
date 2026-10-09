import { timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export const SPOTIFY_CALLBACK_URI = 'http://127.0.0.1:8888/callback';
export function spotifyAuthorizationUrl(
  clientId: string,
  state: string,
): string {
  return `https://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: SPOTIFY_CALLBACK_URI, state, scope: 'playlist-read-private playlist-read-collaborative' })}`;
}
export function spotifyCallbackCode(
  value: string,
  expectedState: string,
): string {
  const url = new URL(value);
  const state = url.searchParams.get('state') ?? '';
  const suppliedState = Buffer.from(state);
  const requiredState = Buffer.from(expectedState);
  if (
    url.origin + url.pathname !== SPOTIFY_CALLBACK_URI ||
    suppliedState.length !== requiredState.length ||
    !timingSafeEqual(suppliedState, requiredState)
  )
    throw new Error('Spotify callback state or address is invalid.');
  const code = url.searchParams.get('code');
  if (url.searchParams.has('error') || !code || code.length > 4096)
    throw new Error('Spotify authorization was not granted.');
  return code;
}
export async function exchangeSpotifyCode(
  clientId: string,
  clientSecret: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher('https://accounts.spotify.com/api/token', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_CALLBACK_URI,
    }).toString(),
  });
  if (!response.ok)
    throw new Error(`Spotify authorization failed (HTTP ${response.status}).`);
  const value = (await response.json()) as { refresh_token?: unknown };
  if (typeof value.refresh_token !== 'string' || !value.refresh_token.trim())
    throw new Error('Spotify did not return a refresh token.');
  return value.refresh_token;
}
/** Bot-owned secret persistence; the engine never imports filesystem code. */
export async function saveSpotifyRefreshToken(
  token: string,
  path = '.env',
): Promise<void> {
  if (!token || /[\s"'\\]/u.test(token))
    throw new Error('Spotify returned an invalid refresh token.');
  let current = '';
  try {
    current = await readFile(path, 'utf8');
  } catch (error) {
    if (!(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ))
      throw new Error('Could not read Spotify authorization configuration.');
  }
  const setting = `SPOTIFY_REFRESH_TOKEN=${JSON.stringify(token)}`;
  const next = /^SPOTIFY_REFRESH_TOKEN=.*$/m.test(current)
    ? current.replace(/^SPOTIFY_REFRESH_TOKEN=.*$/m, () => setting)
    : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${setting}\n`;
  try {
    await writeFile(path, next, { encoding: 'utf8', mode: 0o600 });
  } catch {
    throw new Error('Could not save Spotify authorization configuration.');
  }
}
