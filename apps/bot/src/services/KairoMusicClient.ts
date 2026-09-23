import type { KairoMusicEngine, ParseResult } from '@kairo/music-engine';

/** Discord application adapter; engine internals stay behind the package entry point. */
export class KairoMusicClient {
  constructor(private readonly engine: KairoMusicEngine) {}

  parse(
    input: string,
    guildId: string,
    requestedBy: string,
  ): Promise<ParseResult> {
    return this.engine.parse({ input, guildId, requestedBy });
  }
}
