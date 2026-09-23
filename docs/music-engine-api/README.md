# Kairo Music Engine API

The only supported import is `@kairo/music-engine`. The package export map rejects subpath imports. Internal modules are free to change without application changes. No Discord interaction or database model crosses this boundary.

The current public facade is `createKairoMusicEngine({ fixtureTracks })`, returning `parse(request)` and `shutdown()`. `ParseRequest` carries `input`, `guildId`, and `requestedBy`. The offline parser returns a canonical metadata-only `Track` for a fixture URL or search candidates for text. Errors use the stable `INVALID_QUERY`, `UNSUPPORTED_PROVIDER`, and `NO_SEARCH_RESULTS` codes. This is a partial Phase 1 API; queue, stream, voice, and playback methods are not yet exposed.
