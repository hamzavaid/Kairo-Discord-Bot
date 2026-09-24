import type { Track } from '../domain/Track.js';
import {
  featuredArtists,
  normalizeArtist,
  normalizeTitle,
  tokenize,
} from './normalization.js';
import type { MatchSignals, MatchWeights } from './types.js';
import { compareVersions, detectVersions } from './versionDetection.js';

export const DEFAULT_WEIGHTS: MatchWeights = {
  titleSimilarity: 0.35,
  artistSimilarity: 0.3,
  durationSimilarity: 0.2,
  albumSimilarity: 0.05,
  providerQuality: 0.05,
  versionCompatibility: 0.05,
};

function editSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j]!;
      previous[j] = Math.min(
        above + 1,
        previous[j - 1]! + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - previous[right.length]! / Math.max(left.length, right.length, 1);
}

function tokenSimilarity(
  left: readonly string[],
  right: readonly string[],
): number {
  if (!left.length || !right.length) return 0;
  const a = new Set(left);
  const b = new Set(right);
  const common = [...a].filter((item) => b.has(item)).length;
  return (2 * common) / (a.size + b.size);
}

export function titleSimilarity(source: Track, candidate: Track): number {
  const left = normalizeTitle(source.title, detectVersions(source));
  const right = normalizeTitle(candidate.title, detectVersions(candidate));
  if (!left.length || !right.length) return 0;
  return (
    0.7 * tokenSimilarity(left, right) +
    0.3 * editSimilarity(left.join(' '), right.join(' '))
  );
}

export function artistSimilarity(
  source: Track,
  candidate: Track,
  aliases: Readonly<Record<string, string>>,
): number {
  const names = (track: Track) =>
    [
      ...track.artists.map((artist) => artist.name),
      ...featuredArtists(track.title),
    ]
      .map((name) => normalizeArtist(name, aliases))
      .filter(Boolean);
  const left = [...new Set(names(source))];
  const right = [...new Set(names(candidate))];
  if (!left.length || !right.length) return 0;
  const compare = (a: string, b: string) =>
    a === b
      ? 1
      : 0.6 * tokenSimilarity(tokenize(a), tokenize(b)) +
        0.4 * editSimilarity(a, b);
  const recall =
    left.reduce(
      (sum, name) =>
        sum + Math.max(...right.map((other) => compare(name, other))),
      0,
    ) / left.length;
  const precision =
    right.reduce(
      (sum, name) =>
        sum + Math.max(...left.map((other) => compare(name, other))),
      0,
    ) / right.length;
  return 0.65 * recall + 0.35 * precision;
}

export function durationSimilarity(
  source?: number,
  candidate?: number,
): number {
  if (source === undefined || candidate === undefined) return 0.6;
  if (source <= 0 || candidate <= 0) return 0;
  const difference = Math.abs(source - candidate);
  const relative = difference / Math.max(source, candidate);
  if (difference <= 3000 || relative <= 0.01) return 1;
  if (difference <= 8000 && relative <= 0.04) return 0.96;
  if (difference >= 45_000 && relative >= 0.2) return 0;
  return Math.max(0, 1 - Math.max(difference / 45_000, relative / 0.2) * 0.8);
}

export function albumSimilarity(source: Track, candidate: Track): number {
  if (!source.album || !candidate.album) return 0.5;
  const left = tokenize(source.album.title);
  const right = tokenize(candidate.album.title);
  return tokenSimilarity(left, right);
}

export function scoreCandidate(
  source: Track,
  candidate: Track,
  weights: MatchWeights,
  quality: number,
  aliases: Readonly<Record<string, string>>,
): { score: number; signals: MatchSignals; rejectionReason?: string } {
  const version = compareVersions(
    detectVersions(source),
    detectVersions(candidate),
  );
  const signals: MatchSignals = {
    titleSimilarity: titleSimilarity(source, candidate),
    artistSimilarity: artistSimilarity(source, candidate, aliases),
    durationSimilarity: durationSimilarity(
      source.durationMs,
      candidate.durationMs,
    ),
    albumSimilarity: albumSimilarity(source, candidate),
    providerQuality: quality,
    versionCompatibility: version.similarity,
  };
  const score = (Object.keys(weights) as (keyof MatchWeights)[]).reduce(
    (sum, key) => sum + weights[key] * signals[key],
    0,
  );
  const durationDifference =
    source.durationMs !== undefined && candidate.durationMs !== undefined
      ? Math.abs(source.durationMs - candidate.durationMs)
      : 0;
  const durationOutlier =
    durationDifference >= 45_000 &&
    source.durationMs !== undefined &&
    candidate.durationMs !== undefined &&
    durationDifference / Math.max(source.durationMs, candidate.durationMs) >=
      0.2;
  const rejectionReason =
    signals.artistSimilarity < 0.55
      ? 'artist_mismatch'
      : version.incompatible
        ? 'version_mismatch'
        : durationOutlier
          ? 'duration_outlier'
          : undefined;
  return {
    score: Math.min(1, Math.max(0, Number(score.toFixed(6)))),
    signals,
    ...(rejectionReason ? { rejectionReason } : {}),
  };
}
