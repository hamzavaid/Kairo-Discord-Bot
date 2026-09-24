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
  remix: /\bremix\b/gu,
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
  const folded = tokenize(name.replace(/\s+-\s+topic$/iu, '')).join(' ');
  const alias = Object.hasOwn(aliases, folded) ? aliases[folded] : undefined;
  return alias ? tokenize(alias).join(' ') : folded;
}

export function featuredArtists(title: string): string[] {
  const match = /\b(?:feat\.?|ft\.?)\s+([^()[\]-]+)/iu.exec(title);
  return match?.[1]
    ? match[1].split(/\s*(?:,|&|\band\b)\s*/iu).filter(Boolean)
    : [];
}
