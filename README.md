# Kairo-Discord-Bot

Kairo is a TypeScript Discord music and entertainment platform under reconstruction. The workspace separates the Discord application from a reusable `@kairo/music-engine` API. The engine parses metadata through `youtube-sr` by default, or through a configured YouTube Data API, Spotify, or MusicBrainz adapter. The engine now has per-guild queues and a fixture/local audio playback pipeline through `@discordjs/voice`. Discord music commands are not yet implemented.

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

## Queue and fixture playback

The public engine API supports enqueue, queue snapshots, skip, stop, clear, remove, move, shuffle, repeat, previous, voice connection, pause, resume, and playback snapshots. Queue and playback implementation types remain private to the engine. For development, `fixtureAudio` maps explicit fixture track IDs to Opus packets or a local file. Already compatible Opus streams bypass FFmpeg; other declared local inputs use a managed FFmpeg process. Set `ffmpegPath` when FFmpeg is outside `PATH`.

The bot registers `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/disconnect`, `/queue`, `/ping`, `/settings`, `/help`, `/info`, and `/auditlog`. Set `DISCORD_DEV_GUILD_ID` for development-guild registration and run the built bot with `node apps/bot/dist/index.js`. `/auditlog` is available to the application owner and IDs in `KAIRO_DEVELOPER_IDS`; its bounded in-memory history resets when the bot restarts.

For the Phase 6 voice smoke path, set `KAIRO_FIXTURE_AUDIO_PATH` to a local audio file, join a voice channel, then run `/play https://fixture.kairo.invalid/tracks/demo`. Set `KAIRO_FIXTURE_AUDIO_INPUT_TYPE=ogg/opus` or `webm/opus` only when the file really contains that format; those inputs bypass FFmpeg. Other local formats need FFmpeg. The bot must be allowed to connect and speak in that channel. `/info <query>` resolves metadata without joining voice or queueing.

Production `/play` uses yt-dlp for public YouTube audio. Spotify and MusicBrainz metadata first searches YouTube and must pass the candidate matcher; YouTube tracks reuse their video ID. Install yt-dlp and FFmpeg on the bot host, or use the Docker image. `YT_DLP_PATH` selects the executable. `/settings audio_quality` stores a guild's `low`, `medium`, `high` (default), or `best` quality; the next track reads the current setting. `KAIRO_METADATA_PROVIDER` selects the metadata search provider (default `youtube-sr`), while `KAIRO_PLAYABLE_SEARCH_PROVIDER` selects the YouTube candidate adapter (default `youtube-sr`). `/info` resolves metadata without playback.
