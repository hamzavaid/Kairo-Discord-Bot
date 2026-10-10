const NOISE = [
  /\b(?:official\s+)?(?:music\s+)?video\b/gu,
  /\b(?:official\s+)?audio\b/gu,
  /\blyric(?:s|\s+video)?\b/gu,
  /\bvisuali[sz]er\b/gu,
  /\b(?:hd|4k)\b/gu,
];
import type { VersionMarker } from './versionDetection.js';

const VERSION_PATTERNS: Record<VersionMarker, RegExp> = {
  live: /\blive\b/gu,
  remix: /\b(?:remix|another\s+mix|alternate\s+mix)\b/gu,
  remaster: /\bremaster(?:ed)?\b/gu,
  acoustic: /\bacoustic\b/gu,
  instrumental: /\binstrumental\b/gu,
  karaoke: /\bkaraoke\b/gu,
  cover: /\bcover\b/gu,
  'sped-up': /\bsped\s+up\b/gu,
  slowed: /\bslowed(?:\s+down)?\b/gu,
  nightcore: /\bnightcore\b/gu,
  'radio-edit': /\bradio\s+edit\b/gu,
  'extended-mix': /\bextended\s+mix\b/gu,
  demo: /\bdemo\b/gu,
};

export function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .normalize('NFKC')
    .toLocaleLowerCase('en');
}

export function tokenize(value: string): string[] {
  return fold(value)
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function normalizeTitle(
  title: string,
  versions: ReadonlySet<VersionMarker>,
): string[] {
  let value = fold(title).replace(/\b(?:feat\.?|ft\.?)\s+[^()[\]-]+/gu, ' ');
  for (const noise of NOISE) value = value.replace(noise, ' ');
  for (const marker of versions)
    value = value.replace(VERSION_PATTERNS[marker], ' ');
  return tokenize(value);
}

export function normalizeArtist(
  name: string,
  aliases: Readonly<Record<string, string>> = {},
): string {
  const folded = tokenize(
    name.replace(/\s+-\s+topic$|\s+official(?:\s+channel)?$/iu, ''),
  ).join(' ');
  const alias = Object.hasOwn(aliases, folded) ? aliases[folded] : undefined;
  return alias ? tokenize(alias).join(' ') : folded;
}

export function featuredArtists(title: string): string[] {
  const match = /\b(?:feat\.?|ft\.?)\s+([^()[\]-]+)/iu.exec(title);
  return match?.[1]
    ? match[1].split(/\s*(?:,|&|\band\b)\s*/iu).filter(Boolean)
    : [];
}

/** Exact delimited performer credits provide evidence independently of an uploader. */
export function artistTitleCredit(
  title: string,
  artists: readonly { name: string }[],
): { title: string; artists?: string[] } {
  const segments = title.split(/\s[-\u2013\u2014:]\s|\//u);
  for (let index = 0; index < segments.length; index++) {
    const credits = segments[index]!.split(/\s+(?:&|and|x)\s+|,\s*/iu);
    const found = credits.map(
      (credit) =>
        artists.find(
          (item) => normalizeArtist(item.name) === normalizeArtist(credit),
        )?.name,
    );
    if (
      segments.length > 1 &&
      found.length &&
      found.every((name): name is string => Boolean(name))
    ) {
      const song =
        index === 0
          ? title
              .slice(segments[0]!.length)
              .replace(/^\s*(?:[-\u2013\u2014:]|\/)\s*/u, '')
          : segments.slice(0, index).join(' - ');
      if (song.trim()) return { title: song, artists: found };
    }
  }
  return { title };
}

/** Explicit alternate title text is evidence; version words are never standalone title aliases. */
export function titleVariants(
  title: string,
  versions: ReadonlySet<VersionMarker>,
  bilingual = false,
): string[][] {
  const variants = [title];
  for (const match of title.matchAll(/[([]([^()[\]]+)[)\]]/gu)) {
    if (match[1]) variants.push(...match[1].split(/\s*(?:\/|\|)\s*/u));
  }
  // Slash-separated bilingual titles often repeat a translated subtitle.
  if (
    bilingual ||
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)
  )
    variants.push(...title.split(/\s*(?:\/|\|)\s*/u));
  return variants
    .map((value) => normalizeTitle(value, versions))
    .filter((tokens) => tokens.length > 0);
}

export function phoneticKey(word: string): string {
  return tokenize(word)
    .join('')
    .replace(/c/gu, 'k')
    .replace(/[aeiouy]/gu, '')
    .replace(/(.)\1+/gu, '$1');
}
