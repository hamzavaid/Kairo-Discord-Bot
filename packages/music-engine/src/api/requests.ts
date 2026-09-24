import type { Track } from '../domain/Track.js';
import type { TrackCollection } from '../domain/TrackCollection.js';

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
  requestId?: string;
}

export type ParseResult =
  | { kind: 'track'; track: Track }
  | { kind: 'collection'; collection: TrackCollection }
  | { kind: 'search'; candidates: Track[] }
  | { kind: 'unsupported'; reason: string };
