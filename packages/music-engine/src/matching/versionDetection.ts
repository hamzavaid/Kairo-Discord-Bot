import type { Track } from '../domain/Track.js';

export type VersionMarker =
  | 'live'
  | 'remix'
  | 'remaster'
  | 'acoustic'
  | 'instrumental'
  | 'karaoke'
  | 'cover'
  | 'sped-up'
  | 'slowed'
  | 'nightcore'
  | 'radio-edit'
  | 'extended-mix'
  | 'demo';

const patterns: readonly [VersionMarker, RegExp][] = [
  [
    'live',
    /(?:[([]\s*live\b|[-–—:]\s*live\b|\blive\b\s*$|\blive\s+(?:at|in|from)\b)/iu,
  ],
  ['remix', /\bremix\b/iu],
  ['remaster', /\bremaster(?:ed)?\b/iu],
  ['acoustic', /\bacoustic\b/iu],
  ['instrumental', /\binstrumental\b/iu],
  ['karaoke', /\bkaraoke\b/iu],
  ['cover', /\bcover\b/iu],
  ['sped-up', /\bsped\s+up\b/iu],
  ['slowed', /\bslowed(?:\s+down)?\b/iu],
  ['nightcore', /\bnightcore\b/iu],
  ['radio-edit', /\bradio\s+edit\b/iu],
  ['extended-mix', /\bextended\s+mix\b/iu],
  ['demo', /\bdemo\b/iu],
];

export function detectVersions(track: Track): ReadonlySet<VersionMarker> {
  const found = new Set<VersionMarker>();
  for (const [marker, pattern] of patterns)
    if (pattern.test(track.title)) found.add(marker);
  if (track.isLive) found.add('live');
  return found;
}

const material = new Set<VersionMarker>([
  'live',
  'remix',
  'acoustic',
  'instrumental',
  'karaoke',
  'cover',
  'sped-up',
  'slowed',
  'nightcore',
  'extended-mix',
  'demo',
]);

export function compareVersions(
  source: ReadonlySet<VersionMarker>,
  candidate: ReadonlySet<VersionMarker>,
): { similarity: number; incompatible: boolean } {
  const differing = new Set(
    [...source, ...candidate].filter(
      (marker) => source.has(marker) !== candidate.has(marker),
    ),
  );
  if (differing.size === 0) return { similarity: 1, incompatible: false };
  return {
    similarity: [...differing].some((marker) => material.has(marker)) ? 0 : 0.5,
    incompatible: [...differing].some((marker) => material.has(marker)),
  };
}
