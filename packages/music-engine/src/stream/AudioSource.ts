import type { Readable } from 'node:stream';

export type AudioInputType =
  'opus' | 'ogg/opus' | 'webm/opus' | 'raw' | 'arbitrary';

export type AudioSource =
  | {
      kind: 'readable';
      input: Readable;
      inputType: AudioInputType;
      sourceProvider: string;
      seekable: boolean;
    }
  | {
      kind: 'file';
      input: string;
      inputType: AudioInputType;
      sourceProvider: string;
      seekable: boolean;
    };

export interface PreparedAudio {
  input: Readable;
  inputType: AudioInputType;
  dispose(): void;
}
