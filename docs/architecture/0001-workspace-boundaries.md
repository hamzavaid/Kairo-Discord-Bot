# Workspace and music engine boundary

Phase 0 decision: use a pnpm workspace with a Node.js 24.17+ runtime and independent packages. `apps/bot` is the only Discord application package. `@kairo/music-engine` exposes only `.` from its package export map. Consumers import public DTOs and the facade through `@kairo/music-engine`; parser, provider, queue, stream, playback, FFmpeg, and voice modules remain package-private. The engine has no dependency on the bot, persistence, or games packages.

`packages/shared` owns configuration and structured logging. Other packages may depend on shared, but shared may not depend on them. Data and games are reserved as isolated packages for later phases. Phase 0 includes no playback or provider implementation. Phase 1 begins with offline canonical models and a fixture provider.

The legacy code is a behavior reference only. Prefix commands, direct `discord-player` usage, and large utility modules are not migrated as architecture.
