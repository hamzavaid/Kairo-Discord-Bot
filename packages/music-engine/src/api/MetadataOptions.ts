export type MetadataProviderId =
  'youtube-sr' | 'youtube-api' | 'spotify' | 'musicbrainz';
export interface YoutubeSrOptions {
  search?: (query: string, options: { limit: number }) => Promise<unknown[]>;
  getVideo?: (url: string) => Promise<unknown>;
  timeoutMs?: number;
}
export interface YouTubeApiOptions {
  apiKey: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  searchCacheMs?: number;
  onQuotaUse?: (operation: 'search' | 'videos', units: number) => void;
}
export interface SpotifyOptions {
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  searchCacheMs?: number;
}
