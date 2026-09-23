# Next tasks

## Continue Phase 1

- Write failing tests for provider registration, capability-based selection, and invalid fixture/provider payload rejection.
- Add the provider registry behind the public engine facade and event/error DTO contracts without exposing engine internals.
- Test collection ordering and limits only when a collection-capable fixture provider exists.
- Phase 1 exit: a client can instantiate the engine from `@kairo/music-engine`, and offline text and fixture URLs produce canonical objects through the public API with deterministic tests.

## Blockers

- No approved real provider is selected; network metadata integration belongs to Phase 2.
