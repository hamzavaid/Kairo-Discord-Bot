import type { Track } from '@kairo/music-engine';

function seconds(ms?: number): string {
  if (ms === undefined) return 'unknown';
  return `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
}

export function infoText(track: Track): string {
  return [
    `Title: ${track.title}`,
    `Artists: ${track.artists.map((artist) => artist.name).join(', ')}`,
    ...(track.album ? [`Album: ${track.album.title}`] : []),
    `Duration: ${seconds(track.durationMs)}`,
    `Provider: ${track.sourceProvider}`,
    `Resolved by: ${track.provenance.parsedBy}`,
    ...(track.sourceId ? [`Source ID: ${track.sourceId}`] : []),
    ...(track.canonicalUrl ? [`URL: ${track.canonicalUrl}`] : []),
    ...(track.artworkUrl ? [`Artwork: ${track.artworkUrl}`] : []),
    ...(track.provenance.confidence === undefined
      ? []
      : [`Confidence: ${track.provenance.confidence.toFixed(2)}`]),
  ]
    .join('\n')
    .slice(0, 1900);
}
