# Kairo-Discord-Bot

Kairo is a TypeScript Discord music and entertainment platform under reconstruction. The workspace separates the Discord application from a reusable `@kairo/music-engine` API. Phase 0 provides tooling and startup infrastructure. An early Phase 1 parser handles offline fixture tracks; music playback and commands are not yet implemented.

## Development

Use Node.js 24.17+ and pnpm 10. Install with `pnpm install --frozen-lockfile`, then run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Copy `.env.example` to a local `.env` and supply credentials before running the bot. The `.env` file is ignored by Git.

The technical specification and implementation notes are kept locally under `docs/` and are excluded from Git. Public architecture documentation, when added, belongs under `docs/public/`.
