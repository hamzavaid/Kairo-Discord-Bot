import { MusicError } from '../api/errors.js';
import type { FixtureTrack } from '../api/requests.js';
import type { Track } from '../domain/Track.js';

export class FixtureProvider {
  private readonly tracks: Map<string, FixtureTrack>;

  constructor(tracks: FixtureTrack[]) {
    this.tracks = new Map(tracks.map((track) => [track.id, track]));
  }

  get(
    id: string,
    input: string,
    requestedBy: string,
    canonicalUrl?: string,
  ): Track {
    const fixture = this.tracks.get(id);
    if (!fixture)
      throw new MusicError('NO_SEARCH_RESULTS', 'No matching song was found.');
    return this.toTrack(fixture, input, requestedBy, 'fixture', canonicalUrl);
  }

  search(
    query: string,
    input: string,
    requestedBy: string,
    maxResults: number,
  ): Track[] {
    const terms = query.toLocaleLowerCase('en').split(' ');
    return [...this.tracks.values()]
      .filter((fixture) => {
        const haystack =
          `${fixture.artists.map((artist) => artist.name).join(' ')} ${fixture.title}`
            .toLocaleLowerCase('en')
            .normalize('NFKC');
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, maxResults)
      .map((fixture) => this.toTrack(fixture, input, requestedBy, 'search'));
  }

  private toTrack(
    fixture: FixtureTrack,
    input: string,
    requestedBy: string,
    parsedBy: 'fixture' | 'search',
    canonicalUrl?: string,
  ): Track {
    return {
      id: `fixture:${fixture.id}`,
      title: fixture.title,
      artists: fixture.artists.map((artist) => ({ name: artist.name })),
      ...(fixture.durationMs === undefined
        ? {}
        : { durationMs: fixture.durationMs }),
      ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
      sourceProvider: 'fixture',
      sourceId: fixture.id,
      isLive: false,
      requestedBy,
      provenance: { input, parsedBy },
      createdAt: new Date(),
    };
  }
}
