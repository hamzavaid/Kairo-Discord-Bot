import kuromoji, { type Tokenizer, type IpadicFeatures } from 'kuromoji';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { toRomaji } from 'wanakana';
import type { Track } from '../domain/Track.js';
import { normalizeArtist } from './normalization.js';
import { MusicError } from '../api/errors.js';
import { TimedCache } from '../providers/musicbrainz/TimedCache.js';

const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const cache = new TimedCache<string>(512, Date.now);
let tokenizer: Promise<Tokenizer<IpadicFeatures>> | undefined;
function dictionary() {
  tokenizer ??= new Promise<Tokenizer<IpadicFeatures>>((resolve, reject) => {
    const require = createRequire(import.meta.url);
    const dictPath = join(
      dirname(require.resolve('kuromoji/package.json')),
      'dict',
    );
    kuromoji.builder({ dicPath: dictPath }).build((error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
  return tokenizer;
}

/** Local dictionary readings, not guessed translations, song-specific aliases or API calls. */
export async function titleReadings(
  tracks: readonly Track[],
  signal?: AbortSignal,
): Promise<Readonly<Record<string, string>>> {
  const result: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  const needed = tracks.filter((track) => japanese.test(track.title));
  if (!needed.length) return result;
  let onAbort: (() => void) | undefined;
  const cancelled = () =>
    new MusicError('PARSER_CANCELLED', 'The music request was cancelled.');
  if (signal?.aborted) throw cancelled();
  try {
    const analyzer = await Promise.race([
      dictionary(),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(cancelled());
        signal?.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
    for (const track of needed) {
      if (signal?.aborted) throw cancelled();
      let reading = cache.get(track.title);
      if (reading === undefined) {
        const parts: string[] = [];
        let katakana = false;
        for (const token of analyzer.tokenize(track.title)) {
          const currentKatakana = /^[\p{Script=Katakana}\u30fc]+$/u.test(
            token.surface_form,
          );
          const value = toRomaji(token.reading ?? token.surface_form);
          if (katakana && currentKatakana) parts[parts.length - 1] += value;
          else parts.push(value);
          katakana = currentKatakana;
        }
        reading = parts.join(' ').replace(/\s+/gu, ' ').trim();
        cache.set(track.title, reading, 3600000);
      }
      result[track.id] = reading;
    }
    return result;
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

export async function artistReadings(
  tracks: readonly Track[],
  signal?: AbortSignal,
): Promise<Readonly<Record<string, readonly string[]>>> {
  const names = tracks.flatMap((track) =>
    track.artists.map((artist, index) => ({
      ...track,
      id: `${track.id}:artist:${index}`,
      title: normalizeArtist(artist.name),
    })),
  );
  const readings = await titleReadings(names, signal);
  return Object.fromEntries(
    tracks.map((track) => [
      track.id,
      track.artists.map(
        (artist, index) =>
          readings[`${track.id}:artist:${index}`] ??
          normalizeArtist(artist.name),
      ),
    ]),
  );
}
