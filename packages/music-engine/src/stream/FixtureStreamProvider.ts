import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { MusicError } from '../api/errors.js';
import type { Track } from '../domain/Track.js';
import type { AudioInputType, AudioSource } from './AudioSource.js';
import type { StreamProvider } from './StreamProvider.js';

export type FixtureAudio =
  | { packets: readonly Uint8Array[] }
  | { path: string; inputType?: AudioInputType };

/** Only explicitly configured fixture IDs can resolve to local media. */
export class FixtureStreamProvider implements StreamProvider {
  readonly id = 'fixture';
  constructor(
    private readonly fixtures: Readonly<Record<string, FixtureAudio>>,
  ) {}

  canStream(track: Track): boolean {
    return (
      track.sourceProvider === this.id &&
      Boolean(track.sourceId) &&
      Object.hasOwn(this.fixtures, track.sourceId!)
    );
  }

  async resolveAudio(track: Track, signal: AbortSignal): Promise<AudioSource> {
    if (signal.aborted)
      throw new MusicError(
        'STREAM_CANCELLED',
        'Stream resolution was cancelled.',
      );
    if (!this.canStream(track))
      throw new MusicError(
        'STREAM_UNAVAILABLE',
        'No playable source is available.',
      );
    const config = this.fixtures[track.sourceId!]!;
    if ('packets' in config) {
      const packets = config.packets.map((packet) => Buffer.from(packet));
      return {
        kind: 'readable',
        input: Readable.from(packets, { objectMode: true }),
        inputType: 'opus',
        sourceProvider: this.id,
        seekable: false,
      };
    }
    if (!config.path || !existsSync(config.path))
      throw new MusicError(
        'STREAM_UNAVAILABLE',
        'No playable source is available.',
      );
    return {
      kind: 'file',
      input: config.path,
      inputType: config.inputType ?? 'arbitrary',
      sourceProvider: this.id,
      seekable: true,
    };
  }
}
