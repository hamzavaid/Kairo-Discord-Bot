import { fold, tokenize } from '../../matching/normalization.js';
import type { ProviderTrack } from '../MediaProvider.js';

// A single bounded provider request supplies a pool even for one-result callers.
export const MUSIC_SEARCH_POOL_SIZE = 25;
const MUSIC_HINT =
  /\b(?:official\s+(?:(?:music|lyric)\s+)?(?:video|audio)|music\s+video|lyrics?|visuali[sz]er|original\s+song)\b/u;
const CHANNEL_HINT = /(?:\s+-\s+topic$|\bvevo$|\bmusic$)/u;
const COMMENTARY =
  /\b(?:reaction|review|tutorial|walkthrough|gameplay|explained|breakdown|weapons?|muzzle|pistols?|suppressor)\b/u;
const VERSIONS = [
  /\bcover\b/u,
  /\bremix\b/u,
  /\bacoustic\b/u,
  /\bkaraoke\b/u,
  /\binstrumental\b/u,
  /\bnightcore\b/u,
  /\bsped\s+up\b/u,
  /\bslowed(?:\s+down)?\b/u,
  /\blive\b/u,
  /\bextended\s+mix\b/u,
  /\bdemo\b/u,
];

function relevance(query: readonly string[], track: ProviderTrack): number {
  const title = new Set(tokenize(track.title));
  const artists = track.artists.flatMap((artist) => tokenize(artist.name));
  // Incomplete artist names are common. Only allow substantial prefixes;
  // exact title/artist matches always receive more credit.
  const sum = query.reduce(
    (score, token) =>
      score +
      (title.has(token) || artists.includes(token)
        ? 1
        : token.length >= 4 &&
            artists.some(
              (artist) =>
                artist.startsWith(token) && token.length / artist.length >= 0.6,
            )
          ? 0.85
          : 0),
    0,
  );
  return query.length ? sum / query.length : 0;
}

/** Discovery ordering only: these scores are not track-equivalence confidence. */
export function rankMusicSearchResults(
  query: string,
  tracks: readonly ProviderTrack[],
): ProviderTrack[] {
  const tokens = [...new Set(tokenize(query))];
  const foldedQuery = fold(query);
  const seen = new Set<string>();
  return tracks
    .flatMap((track, index) => {
      if (seen.has(track.sourceId)) return [];
      seen.add(track.sourceId);
      const title = fold(track.title);
      const coverage = relevance(tokens, track);
      const musicHint =
        MUSIC_HINT.test(title) ||
        track.artists.some((artist) => CHANNEL_HINT.test(fold(artist.name)));
      const commentary =
        COMMENTARY.test(title) && !COMMENTARY.test(foldedQuery);
      const alternate = VERSIONS.filter(
        (pattern) => pattern.test(title) && !pattern.test(foldedQuery),
      ).length;
      const score =
        0.85 * coverage +
        (coverage >= 0.5 && musicHint ? 0.2 : 0) -
        (commentary ? 0.25 : 0) -
        Math.min(0.24, alternate * 0.12);
      return [{ track, index, score }];
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((result) => result.track);
}
