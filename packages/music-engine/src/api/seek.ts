import { MusicError } from './errors.js';
export function validateSeekPosition(
  positionMs: number,
  durationMs?: number,
): void {
  if (
    !Number.isFinite(positionMs) ||
    !Number.isInteger(positionMs) ||
    positionMs < 0 ||
    positionMs > 86400000 ||
    (durationMs !== undefined && positionMs > durationMs)
  )
    throw new MusicError(
      'INVALID_SEEK_POSITION',
      'Choose a valid position within the track duration.',
    );
}
export function parseSeekTimestamp(input: string): number {
  const text = input.trim();
  let seconds: number;
  if (/^\d+(?:\.\d{1,3})?$/u.test(text)) seconds = Number(text);
  else if (/^\d+:\d{2}(?::\d{2})?$/u.test(text)) {
    const parts = text.split(':').map(Number);
    if (parts.at(-1)! >= 60 || (parts.length === 3 && parts[1]! >= 60))
      throw new MusicError(
        'INVALID_SEEK_POSITION',
        'Use seconds, m:ss or h:mm:ss.',
      );
    seconds = parts.reduce((value, part) => value * 60 + part, 0);
  } else
    throw new MusicError(
      'INVALID_SEEK_POSITION',
      'Use seconds, m:ss or h:mm:ss.',
    );
  const ms = Math.round(seconds * 1000);
  validateSeekPosition(ms);
  return ms;
}
