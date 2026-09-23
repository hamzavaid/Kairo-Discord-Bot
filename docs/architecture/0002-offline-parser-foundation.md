# Offline parser foundation

Phase 1 starts with a deterministic, offline fixture provider. A caller creates the engine through `@kairo/music-engine` and passes a small fixture catalog. This is a development and test seam until approved real providers are added in Phase 2. The provider registry, query normalizer, and classifier stay private to the package.

The parser accepts free text or `https://fixture.kairo.invalid/tracks/<id>`. The reserved `.invalid` host makes accidental network access impossible. Other URLs fail with a typed unsupported-provider error. Direct HTTP media, local files, collection parsing, and playback are deferred because they need separate security and resource-lifecycle work.

The engine returns metadata-only canonical Tracks. It preserves the original input in provenance and does not invent a playable AudioSource. A track ID is stable within the fixture catalog. `createdAt` is captured when the canonical object is made. The public parser facade intentionally exposes only `parse` and `shutdown` in this stage; future queue and playback methods will be added when implemented and tested.
