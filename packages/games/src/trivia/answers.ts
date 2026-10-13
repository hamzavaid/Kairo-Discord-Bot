import type { TriviaTrack } from '../session/types.js';
export function normalizeAnswer(value: string): string {
  return value
    .replace(
      /(?:\(|\[)(?:official (?:audio|video|music video)|lyric video|lyrics|visualizer|audio|hd|4k)(?:\)|\])/giu,
      ' ',
    )
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}
export function triviaAnswer(
  track: TriviaTrack,
  song: string,
  artist: string,
  mode: 'song' | 'artist' | 'both',
  elapsed: number,
  window: number,
) {
  const songCorrect =
    mode !== 'artist' && normalizeAnswer(song) === normalizeAnswer(track.title);
  const artistCorrect =
    mode !== 'song' &&
    track.artists.some((a) => normalizeAnswer(a) === normalizeAnswer(artist));
  const correct =
    mode === 'song'
      ? songCorrect
      : mode === 'artist'
        ? artistCorrect
        : songCorrect && artistCorrect;
  const base = (songCorrect ? 100 : 0) + (artistCorrect ? 100 : 0);
  const speed = correct
    ? Math.max(0, Math.floor(50 * (1 - Math.max(0, elapsed) / window)))
    : 0;
  return { songCorrect, artistCorrect, correct, points: base + speed };
}
