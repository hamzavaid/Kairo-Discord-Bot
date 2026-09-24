/** Construction options for the opt-in, metadata-only MusicBrainz adapter. */
export interface MusicBrainzOptions {
  /** Contactable URL or email included in every MusicBrainz User-Agent. */
  contact: string;
  timeoutMs?: number;
  searchCacheMs?: number;
  metadataCacheMs?: number;
  /** Transport injection for deterministic tests or controlled runtimes. */
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  /** Receives bounded diagnostics without raw queries or response bodies. */
  logger?: {
    info(
      fields: Record<string, string | number | boolean>,
      message: string,
    ): void;
    warn(
      fields: Record<string, string | number | boolean>,
      message: string,
    ): void;
  };
}
