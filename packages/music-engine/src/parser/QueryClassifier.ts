import { MusicError } from '../api/errors.js';

export type ClassifiedInput =
  | { kind: 'search'; query: string }
  | { kind: 'fixture-track'; id: string; canonicalUrl: string };

export function classifyQuery(query: string): ClassifiedInput {
  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(query) && !/^https?:\/\//iu.test(query)) {
    throw new MusicError(
      'UNSUPPORTED_PROVIDER',
      'This music source is not supported.',
    );
  }
  if (!/^https?:/iu.test(query)) return { kind: 'search', query };
  let url: URL;
  try {
    url = new URL(query);
  } catch {
    throw new MusicError('INVALID_QUERY', 'Enter a valid song URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'fixture.kairo.invalid' ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new MusicError(
      'UNSUPPORTED_PROVIDER',
      'This music source is not supported.',
    );
  }
  const match = /^\/tracks\/([a-z0-9-]+)$/u.exec(url.pathname);
  if (
    !match?.[1] ||
    [...url.searchParams.keys()].some((key) => key !== 'utm_source')
  ) {
    throw new MusicError('INVALID_QUERY', 'Enter a valid fixture track URL.');
  }
  return {
    kind: 'fixture-track',
    id: match[1],
    canonicalUrl: `${url.origin}${url.pathname}`,
  };
}
