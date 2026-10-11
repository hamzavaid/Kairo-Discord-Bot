import { MusicError } from '../api/errors.js';
export const FILTER_GRAPHS = {
  flat: '',
  bassboost: 'bass=g=6,alimiter=limit=0.95',
  nightcore: 'asetrate=48000*1.25,aresample=48000',
  vaporwave: 'asetrate=48000*0.8,aresample=48000',
  lowpass: 'lowpass=f=1500',
  highpass: 'highpass=f=200',
  speech: 'highpass=f=120,lowpass=f=6000,alimiter=limit=0.95',
} as const;
export type FilterPreset = keyof typeof FILTER_GRAPHS;
export interface PlaybackControls {
  volume: number;
  filter: FilterPreset;
}
export function validateVolume(volume: number): void {
  if (!Number.isInteger(volume) || volume < 0 || volume > 100)
    throw new MusicError(
      'INVALID_VOLUME',
      'Volume must be an integer from 0 to 100.',
    );
}
export function validateFilter(filter: string): asserts filter is FilterPreset {
  if (!Object.hasOwn(FILTER_GRAPHS, filter))
    throw new MusicError('UNKNOWN_FILTER', 'Unknown audio filter.');
}
