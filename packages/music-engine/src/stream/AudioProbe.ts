import type { AudioSource } from './AudioSource.js';

/** A bounded, declaration-based probe; unknown local inputs require FFmpeg. */
export class AudioProbe {
  inspect(source: AudioSource): { needsTranscode: boolean } {
    return {
      needsTranscode:
        (source.kind === 'file' && source.inputType === 'opus') ||
        !['opus', 'ogg/opus', 'webm/opus'].includes(source.inputType),
    };
  }
}
