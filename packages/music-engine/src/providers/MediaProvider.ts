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
  album?: { title: string; id?: string };
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
  getCollection?(
    input: Extract<ClassifiedInput, { kind: 'provider-collection' }>,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ProviderCollection>;
}

export interface ProviderCollection {
  title: string;
  tracks: ProviderTrack[];
  total: number;
  skipped: number;
  failed: number;
  truncated: boolean;
  partial: boolean;
}
