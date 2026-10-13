import type { PlaybackSnapshot, Track } from '@kairo/music-engine';
export function clockLabel(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function progressText(playback: PlaybackSnapshot, track: Track): string {
  if (playback.positionMs === undefined) return 'Progress unavailable';
  const elapsed = clockLabel(playback.positionMs);
  if (track.isLive) return `LIVE | ${elapsed} elapsed`;
  const total = playback.durationMs ?? track.durationMs;
  if (!total) return `${elapsed} elapsed | Duration unknown`;
  const position = Math.max(
    0,
    Math.min(19, Math.floor((playback.positionMs / total) * 19)),
  );
  const bar =
    '\u2501'.repeat(position) + '\u25cf' + '\u2501'.repeat(19 - position);
  return `${elapsed} ${bar} ${clockLabel(total)} | ${clockLabel(Math.max(0, total - playback.positionMs))} remaining`;
}
