import type { Track } from '../domain/Track.js';
import type { AudioSource } from './AudioSource.js';
import type { StreamContext } from './AudioQuality.js';

/** Stream acquisition is separate from metadata lookup and matching. */
export interface StreamProvider {
  readonly id: string;
  canStream(track: Track): boolean;
  resolveAudio(
    track: Track,
    signal: AbortSignal,
    context?: StreamContext,
  ): Promise<AudioSource>;
}
