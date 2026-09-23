# Progress

## Phase 0 foundation

- Read the full technical specification and reviewed the legacy package, command categories, and representative music and game behavior.
- Decision: version internal docs and protect the music engine through its package export map and a source import boundary test.
- Added the strict TypeScript pnpm workspace, package exports, validated startup configuration, Pino logging, ESLint, Prettier, Vitest, Docker skeleton, and CI.
- Phase 0 boundary and configuration tests were written before implementation. Build, lint, type check, and tests pass locally. Formatting will be checked again before commit.
- Local tooling issue: pnpm was absent and installed in a temporary directory. Vitest required the unrestricted filesystem view because esbuild could not load its config through the sandbox's restricted view.
- `docs/` was previously ignored by an uncommitted `.gitignore` change; it is now versioned. `legacy/` remains a reference and is not included in the implementation commit, especially its ignored `.env`.
