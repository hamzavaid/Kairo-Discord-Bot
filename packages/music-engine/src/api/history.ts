import type { Track } from '../domain/Track.js';
export type PlaybackOutcome =
  'playing' | 'completed' | 'skipped' | 'stopped' | 'disconnected' | 'failed';
export interface PlaybackAttempt {
  attemptId: string;
  guildId: string;
  userId: string;
  track: Track;
  requestedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  status: PlaybackOutcome;
  source: 'manual' | 'autoplay';
  listenedMs: number;
}
