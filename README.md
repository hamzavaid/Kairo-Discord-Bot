# Kairo-Discord-Bot

Kairo is a TypeScript Discord music and games bot built as a pnpm monorepo. It combines music search and playback, persistent personal libraries, interactive player menus, and multiplayer games. Discord commands use discord.js; audio playback uses `@discordjs/voice` directly, without discord-player or Lavalink.

## Workspace

| Location                | Package               | Responsibility                                                                                                                                     |
| ----------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/bot`              | `@kairo/bot`          | Discord commands, components, interaction handling, authorization, auditing, and service orchestration                                             |
| `packages/music-engine` | `@kairo/music-engine` | Canonical tracks, parsing, metadata adapters, candidate matching, per-guild queues, voice sessions, stream resolution, and managed audio processes |
| `packages/data`         | `@kairo/data`         | MongoDB repositories for guild settings, playlists, Liked Songs, listening history, command audits, game results, and game settings                |
| `packages/games`        | `@kairo/games`        | Discord-independent game sessions, rules, spectators, answer matching, and scoring                                                                 |
| `packages/shared`       | `@kairo/shared`       | Validated environment configuration and structured logging                                                                                         |
| `tests`                 | Workspace tests       | Offline fixtures, unit tests, integration tests, and explicitly opt-in external checks                                                             |

The bot consumes the music engine through its exported API. Commands delegate to services rather than accessing parser, queue, voice, stream, or FFmpeg internals. Each command module owns its builder and execution function; `slashCommandHandler.ts` handles lookup, aliases, registration, execution, auditing, and safe errors.

Technical specifications and working notes under `docs/` are internal and excluded from Git. The local `legacy/` tree is a behavioral reference rather than the current architecture.

## Features

### Music and playback

- Search by text or resolve supported YouTube and Spotify track/collection URLs.
- Queue tracks in order, play next, shuffle, move/remove entries, repeat, and return to previous tracks.
- Control pause/resume, skip, stop, disconnect, volume, filters, and autoplay.
- Use `/player` for artwork, track details, queue controls, live progress, remaining time, and personal library actions.
- Configure persistent per-guild audio quality, playback permissions, and empty-channel disconnect behavior.
- Inspect metadata with `/info` or its `/search` alias, including multiple results, artwork, links, and save/like/play actions.
- Browse recommendations, lyrics, listening history, statistics, and the prototype `/discover` interface.

### Personal libraries

MongoDB-backed playlists and Liked Songs survive restarts. Users can create, inspect, modify, import, and play ordered playlists, or like/unlike tracks and play their library. Component menus provide pagination and confirmation for destructive actions. `/menu` offers an interactive library browser.

### Games

RPS, Hangman, UNO, and Music Trivia share a session system with lobbies, spectators, bounded timers, and persistent statistics and leaderboards. `/games` provides a unified menu and guild game settings; the **Invite to Game** user context menu starts challenges.

Music Trivia supports song, artist, or combined answers using catalog search, the host's Liked Songs, a host-owned Kairo playlist, or a supported public collection. It reuses the canonical music pipeline for bounded previews and requires normal music playback to be idle with an empty queue. Answers remain hidden until the round resolves.

## Metadata and audio architecture

```text
Query / supported URL
  -> SongParser + MetadataProviderManager
  -> canonical Track / ordered TrackCollection
  -> playable candidate discovery + CandidateMatcher, when needed
  -> StreamResolver + YtDlpStreamProvider
  -> AudioSource + AudioProbe / FFmpegPipeline
  -> PlaybackSession + @discordjs/voice
```

Metadata and audio resolution are separate layers:

| Metadata provider | Configuration                                                     | Notes                                                                          |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `youtube-sr`      | No credentials                                                    | Default; unofficial scraper-backed adapter that can break when YouTube changes |
| `youtube-api`     | `YOUTUBE_API_KEY`                                                 | YouTube Data API search and metadata; quota-sensitive                          |
| `spotify`         | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`; optional user grant | Track and collection metadata; never a Spotify audio source                    |
| `musicbrainz`     | `MUSICBRAINZ_USER_AGENT` identifying contact                      | Throttled and cached metadata/identity lookup; not an audio source             |

The engine supports explicit provider selection and an optional fallback chain. No fallback occurs unless configured, and missing credentials for selected providers fail at construction. `KAIRO_METADATA_PROVIDER` selects the bot's search provider; `KAIRO_PLAYABLE_SEARCH_PROVIDER` selects `youtube-sr` or `youtube-api` for YouTube candidate discovery.

Production audio uses yt-dlp for available public YouTube resources. Spotify/MusicBrainz tracks require a reliable matching YouTube candidate; YouTube-origin tracks reuse their video identity. Guild audio quality is `low`, `medium`, `high` (default), or `best`. Compatible native Opus is preferred where practical, with managed FFmpeg transcoding when needed. Resolution and child processes are cancelled/cleaned up on skip, stop, disconnect, failure, and shutdown.

### Current limitations

- Provider permissions, quotas, regional availability, and extractor changes can prevent metadata lookup or playback. Spotify playlist access depends on the app/account permissions and resource availability.
- `/seek` supports seekable local/file sources. Current yt-dlp pipes and live sources are non-seekable and return a safe error. Player progress comes from engine playback state and freezes while paused.
- UNO uses a bounded ruleset: numeric starting discard, draw actions pass the turn, and no Wild Draw Four challenges or jump-in. Draw-two stacking and draw-until-playable are optional settings.
- Active games and playback sessions are in memory; durable libraries, settings, history, and game results survive restarts.

## Run locally

### Requirements

- Node.js **24.17.0 or newer** and pnpm **10** (the workspace pins `pnpm@10.0.0`).
- MongoDB, either local or hosted.
- A Discord application/bot token, application ID, and a development guild for testing.
- yt-dlp, FFmpeg, and ffprobe available on `PATH`, or configured executable paths.
- Bot permissions to use commands, send responses, and connect/speak in voice channels.

From the repository root:

```sh
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` and configure at least:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_DEV_GUILD_ID=your-development-guild-id
MONGODB_URI=mongodb://localhost:27017/kairo
```

Keep `.env` private; it is ignored by Git. Only supply provider credentials needed for the providers/resources you use. `.env.example` includes queue/collection limits, timeouts, caching, logging, and executable paths (`YT_DLP_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH`). `KAIRO_DEVELOPER_IDS` configures additional developer-only access.

```sh
pnpm build
node apps/bot/dist/index.js
```

Startup registers commands in `DISCORD_DEV_GUILD_ID` when configured. Join a voice channel and try `/play <query>`. The queue acknowledgement can arrive before stream startup completes; inspect structured playback logs if audio fails.

For Spotify playlist access requiring a user grant:

```sh
pnpm spotify:authorize
```

This helper saves the refresh token in the local `.env`. Authorization does not override provider access restrictions.

### Global command registration

```sh
pnpm commands:global
```

This builds the workspace and bulk-replaces the application's global command definitions using the handler's command list, including aliases and context menus. It requires `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`; deployment itself does not require MongoDB or voice. Registration publishes definitions; the bot process must still be running to execute commands.

### Docker

The Dockerfile builds the workspace and includes FFmpeg/ffprobe and a pinned yt-dlp installation:

```sh
docker build -t kairo .
docker run --rm --env-file .env kairo
```

Use a MongoDB URI reachable from the container; `localhost` inside the container refers to the container itself.

## Command overview

Use `/help` for current descriptions, options, aliases, and permission-aware command visibility.

| Category  | Commands                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Music     | `/play`, `/playnext`, `/shuffle`, `/player`, `/pause`, `/resume`, `/skip`, `/stop`, `/disconnect`, `/queue`, `/seek`, `/volume`, `/repeat`, `/filter`, `/autoplay`, `/vote`, `/history`, `/lyrics`, `/recommend` |
| Library   | `/playlist`, `/liked`, `/like`, `/dislike`, `/menu`                                                                                                                                                              |
| Utility   | `/ping`, `/help`, `/info` (alias `/search`), `/settings`, `/stats`, `/top`, `/discover`                                                                                                                          |
| Games     | `/games`, `/rps`, `/hangman`, `/uno`, `/musictrivia`                                                                                                                                                             |
| Developer | `/auditlog`                                                                                                                                                                                                      |

`/playlist` manages creation, deletion, listing, inspection, editing, imports, and playback. `/liked` provides `list`, `play`, and confirmed `clear`; `/like` and `/dislike` accept a query or use the current track. `/info <query> [searchs]` accepts 1-25 results; `/search` uses the same command implementation with a larger default result count.

Message context actions include **Play Song**, **Search Music**, **Add to Queue**, **Play Next**, and **Song Info**. Developer commands enforce authorization during execution, not just through visibility. Internal failures are logged with structured diagnostics and mapped to safe Discord responses.

## Development checks

| Command             | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `pnpm format`       | Apply Prettier formatting                                    |
| `pnpm format:check` | Check formatting without editing                             |
| `pnpm lint`         | Run ESLint                                                   |
| `pnpm typecheck`    | Check strict TypeScript types                                |
| `pnpm test`         | Run Vitest unit, fixture, integration, and regression suites |
| `pnpm build`        | Build workspace packages and the bot                         |

Normal automated tests are offline and deterministic: mocked Discord interactions, provider fixtures, repository fixtures, and local audio exercise parsing, matching, concurrency, cleanup, commands, libraries, games, and progress/seek. Live provider and external MongoDB checks are explicitly opt-in and skipped by default; passing the offline suite does not claim a live Discord or external-service check.
