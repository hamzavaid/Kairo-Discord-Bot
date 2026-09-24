import { MusicError } from '../api/errors.js';

export type ClassifiedInput =
  | { kind: 'search'; query: string }
  | {
      kind: 'provider-track';
      providerId: string;
      sourceId: string;
      canonicalUrl: string;
    };

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
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new MusicError(
      'UNSUPPORTED_PROVIDER',
      'This music source is not supported.',
    );
  }
  if (url.hostname === 'musicbrainz.org') {
    const match =
      /^\/recording\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/iu.exec(
        url.pathname,
      );
    if (!match?.[1])
      throw new MusicError(
        'INVALID_QUERY',
        'Enter a valid MusicBrainz recording URL.',
      );
    const sourceId = match[1].toLowerCase();
    return {
      kind: 'provider-track',
      providerId: 'musicbrainz',
      sourceId,
      canonicalUrl: `https://musicbrainz.org/recording/${sourceId}`,
    };
  }
  if (url.hostname === 'open.spotify.com') {
    const match = /^\/track\/([A-Za-z0-9]{22})\/?$/u.exec(url.pathname);
    if (!match?.[1])
      throw new MusicError('INVALID_QUERY', 'Enter a valid Spotify track URL.');
    return {
      kind: 'provider-track',
      providerId: 'spotify',
      sourceId: match[1],
      canonicalUrl: `https://open.spotify.com/track/${match[1]}`,
    };
  }
  if (
    ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(
      url.hostname,
    )
  ) {
    const sourceId =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : url.pathname === '/watch'
          ? url.searchParams.get('v')
          : undefined;
    if (!sourceId || !/^[A-Za-z0-9_-]{11}$/u.test(sourceId))
      throw new MusicError('INVALID_QUERY', 'Enter a valid YouTube video URL.');
    return {
      kind: 'provider-track',
      providerId: 'youtube-sr',
      sourceId,
      canonicalUrl: `https://www.youtube.com/watch?v=${sourceId}`,
    };
  }
  if (url.hostname !== 'fixture.kairo.invalid') {
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
    kind: 'provider-track',
    providerId: 'fixture',
    sourceId: match[1],
    canonicalUrl: `${url.origin}${url.pathname}`,
  };
}
