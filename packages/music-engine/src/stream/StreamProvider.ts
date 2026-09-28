import type { Track } from '../domain/Track.js';
import type { AudioSource } from './AudioSource.js';

/** Stream acquisition is separate from metadata lookup and matching. */
export interface StreamProvider {
  readonly id: string;
  canStream(track: Track): boolean;
  resolveAudio(track: Track, signal: AbortSignal): Promise<AudioSource>;
}
