import type { ClassifiedInput } from '../parser/QueryClassifier.js';

export interface ProviderTrack {
  sourceId: string;
  title: string;
  artists: { name: string; id?: string }[];
  durationMs?: number;
  isLive?: boolean;
  explicit?: boolean;
  artworkUrl?: string;
  canonicalUrl?: string;
}

export interface MediaProvider {
  readonly id: string;
  readonly capabilities: { search: boolean; trackUrl: boolean };
  canParse(input: ClassifiedInput): boolean;
  parse(input: ClassifiedInput, signal?: AbortSignal): Promise<ProviderTrack>;
  search?(
    query: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<ProviderTrack[]>;
}
