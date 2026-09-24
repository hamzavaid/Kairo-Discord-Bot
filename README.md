# Kairo-Discord-Bot

Kairo is a TypeScript Discord music and entertainment platform under reconstruction. The workspace separates the Discord application from a reusable `@kairo/music-engine` API. The engine parses metadata through `youtube-sr` by default, or through a configured YouTube Data API, Spotify, or MusicBrainz adapter. Music playback and commands are not yet implemented.

## Development

Use Node.js 24.17+ and pnpm 10. Install with `pnpm install --frozen-lockfile`, then run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Copy `.env.example` to a local `.env` and supply credentials before running the bot. The `.env` file is ignored by Git.

The technical specification and implementation notes are kept locally under `docs/` and are excluded from Git. Public architecture documentation, when added, belongs under `docs/public/`.

## Metadata providers

The default `youtube-sr` adapter needs no credentials and uses an unofficial, scraper-backed package that may break when YouTube changes. Choose another provider and an optional fallback chain when creating the engine:

```ts
import { createKairoMusicEngine } from '@kairo/music-engine';

const engine = createKairoMusicEngine({
  metadataProvider: 'spotify',
  fallbackProviders: ['musicbrainz', 'youtube-api', 'youtube-sr'],
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID!,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
  },
  musicBrainz: { contact: process.env.MUSICBRAINZ_USER_AGENT! },
  youtubeApi: { apiKey: process.env.YOUTUBE_API_KEY! },
});
```

An explicit provider or fallback with missing credentials fails at construction. With no fallback list, a provider failure is returned to the caller. Spotify and MusicBrainz supply metadata only; no adapter here resolves audio streams. When an offline `fixtureTracks` list is supplied without `metadataProvider`, fixture search keeps the previous development behavior.

## MusicBrainz metadata

MusicBrainz is an opt-in metadata source. Pass a real contact URL or email so Kairo can identify itself in API requests:

```ts
import { createKairoMusicEngine } from '@kairo/music-engine';

const engine = createKairoMusicEngine({
  musicBrainz: { contact: 'https://your-project.example/contact' },
});

const result = await engine.parse({
  input: 'Daft Punk One More Time',
  guildId: 'guild-id',
  requestedBy: 'user-id',
  preferredProvider: 'musicbrainz',
});
```

The adapter uses MusicBrainz's documented JSON API and its rate limit guidance. It returns metadata only; no MusicBrainz audio stream is available through this adapter. See the [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [search documentation](https://musicbrainz.org/doc/MusicBrainz_API/Search), and [rate limits](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).
