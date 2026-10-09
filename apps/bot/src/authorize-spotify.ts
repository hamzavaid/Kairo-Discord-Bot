import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  SPOTIFY_CALLBACK_URI,
  spotifyAuthorizationUrl,
  spotifyCallbackCode,
  exchangeSpotifyCode,
  saveSpotifyRefreshToken,
} from './config/spotifyAuthorization.js';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    throw new Error(
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env first.',
    );
  const state = randomBytes(32).toString('hex');
  let handling = false;
  await new Promise<void>((resolve, reject) => {
    const server = createServer((request, response) => {
      let url: URL;
      try {
        url = new URL(request.url ?? '/', SPOTIFY_CALLBACK_URI);
      } catch {
        response.writeHead(400).end('Invalid request.');
        return;
      }
      if (request.method !== 'GET' || url.pathname !== '/callback') {
        response.writeHead(404).end('Not found.');
        return;
      }
      if (handling) {
        response.writeHead(409).end('Authorization already in progress.');
        return;
      }
      let code: string;
      try {
        code = spotifyCallbackCode(url.href, state);
      } catch {
        response
          .writeHead(400)
          .end(
            'Invalid or declined authorization. Run the setup again if needed.',
          );
        if (
          url.searchParams.get('state') === state &&
          url.searchParams.has('error')
        )
          finish(new Error('Spotify authorization was declined.'));
        return;
      }
      handling = true;
      void (async () => {
        try {
          const token = await exchangeSpotifyCode(clientId, clientSecret, code);
          await saveSpotifyRefreshToken(token);
          response
            .writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            .end(
              'Spotify authorization saved. You can close this tab and restart Kairo.',
            );
          console.log(
            'Spotify refresh token saved to the ignored .env. Restart Kairo.',
          );
          finish();
        } catch {
          response
            .writeHead(500)
            .end('Authorization could not be saved. Run setup again.');
          finish(
            new Error(
              'Spotify authorization exchange or configuration save failed.',
            ),
          );
        }
      })();
    });
    const timer = setTimeout(
      () =>
        finish(
          new Error('Spotify authorization timed out after five minutes.'),
        ),
      300000,
    );
    function finish(error?: Error) {
      clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else resolve();
    }
    server.on('error', () =>
      finish(
        new Error(
          'Could not listen on 127.0.0.1:8888. Check whether the port is in use.',
        ),
      ),
    );
    server.listen(8888, '127.0.0.1', () => {
      console.log(
        `Add this exact redirect URI to your Spotify app settings: ${SPOTIFY_CALLBACK_URI}`,
      );
      console.log(
        'Then open this URL and authorize an account that owns or collaborates on the playlist:',
      );
      console.log(spotifyAuthorizationUrl(clientId, state));
    });
  });
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Spotify authorization failed.',
  );
  process.exitCode = 1;
});
