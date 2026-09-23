import type { Track } from '../domain/Track.js';

/** Offline catalog input for the development fixture provider. */
export interface FixtureTrack {
  id: string;
  title: string;
  artists: { name: string }[];
  durationMs?: number;
}

export interface ParseRequest {
  input: string;
  requestedBy: string;
  guildId: string;
  locale?: string;
  maxResults?: number;
  allowCollections?: boolean;
  preferredProvider?: string;
}

export type ParseResult =
  | { kind: 'track'; track: Track }
  | {
      kind: 'collection';
      collection: { id: string; title: string; tracks: Track[] };
    }
  | { kind: 'search'; candidates: Track[] }
  | { kind: 'unsupported'; reason: string };
