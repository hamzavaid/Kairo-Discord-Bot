# Kairo-Discord-Bot

Kairo is a TypeScript Discord music and entertainment platform under reconstruction. The workspace separates the Discord application from a reusable `@kairo/music-engine` API. The engine parses offline fixture tracks and, when enabled, MusicBrainz recording URLs and text searches into canonical metadata. Music playback and commands are not yet implemented.

## Development

Use Node.js 24.17+ and pnpm 10. Install with `pnpm install --frozen-lockfile`, then run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Copy `.env.example` to a local `.env` and supply credentials before running the bot. The `.env` file is ignored by Git.

The technical specification and implementation notes are kept locally under `docs/` and are excluded from Git. Public architecture documentation, when added, belongs under `docs/public/`.

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
