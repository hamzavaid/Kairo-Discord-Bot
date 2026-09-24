import type { Track } from './Track.js';

/** Ordered metadata collection. Playback sources are never stored here. */
export interface TrackCollection {
  id: string;
  title: string;
  tracks: Track[];
  sourceProvider: string;
  sourceId?: string;
  canonicalUrl?: string;
}
