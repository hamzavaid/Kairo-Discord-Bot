import type { Readable } from 'node:stream';
import type { AudioQuality } from './AudioQuality.js';

export type AudioInputType =
  'opus' | 'ogg/opus' | 'webm/opus' | 'raw' | 'arbitrary';

export type AudioSource =
  | {
      kind: 'readable';
      input: Readable;
      inputType: AudioInputType;
      sourceProvider: string;
      seekable: boolean;
      audioQuality?: AudioQuality;
      dispose?(): void;
    }
  | {
      kind: 'file';
      input: string;
      inputType: AudioInputType;
      sourceProvider: string;
      seekable: boolean;
      audioQuality?: AudioQuality;
      dispose?(): void;
    };

export interface PreparedAudio {
  input: Readable;
  inputType: AudioInputType;
  dispose(): void;
}
