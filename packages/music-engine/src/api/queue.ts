import type { Track } from '../domain/Track.js';

export type RepeatMode = 'off' | 'track' | 'queue';

export interface QueueEntry {
  id: string;
  track: Track;
  enqueuedBy: string;
  enqueuedAt: Date;
}

export interface QueueSnapshot {
  guildId: string;
  current: QueueEntry | undefined;
  upcoming: QueueEntry[];
  history: QueueEntry[];
  repeatMode: RepeatMode;
  /** Changes whenever current playback identity changes. */
  generation: number;
}

export interface EnqueueRequest {
  guildId: string;
  track: Track;
  enqueuedBy: string;
}

export interface EnqueueManyRequest {
  guildId: string;
  tracks: readonly Track[];
  enqueuedBy: string;
}

export interface RemoveRequest {
  guildId: string;
  position?: number;
  entryId?: string;
}

export interface MoveRequest {
  guildId: string;
  from: number;
  to: number;
}
