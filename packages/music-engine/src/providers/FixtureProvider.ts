import { MusicError } from '../api/errors.js';
import type { FixtureTrack } from '../api/requests.js';
import type { ClassifiedInput } from '../parser/QueryClassifier.js';
import type { MediaProvider, ProviderTrack } from './MediaProvider.js';

/** Offline metadata provider used by tests and development only. */
export class FixtureProvider implements MediaProvider {
  readonly id = 'fixture';
  readonly capabilities = { search: true, trackUrl: true };
  private readonly tracks: Map<string, FixtureTrack>;

  constructor(tracks: FixtureTrack[]) {
    this.tracks = new Map(tracks.map((track) => [track.id, track]));
  }

  canParse(input: ClassifiedInput): boolean {
    return input.kind === 'provider-track' && input.providerId === this.id;
  }

  async parse(input: ClassifiedInput): Promise<ProviderTrack> {
    if (input.kind !== 'provider-track' || !this.canParse(input)) {
      throw new MusicError(
        'UNSUPPORTED_PROVIDER',
        'This music source is not supported.',
      );
    }
    const fixture = this.tracks.get(input.sourceId);
    if (!fixture)
      throw new MusicError('NO_SEARCH_RESULTS', 'No matching song was found.');
    return this.toProviderTrack(fixture);
  }

  async search(query: string, maxResults: number): Promise<ProviderTrack[]> {
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
      .map((fixture) => this.toProviderTrack(fixture));
  }

  private toProviderTrack(fixture: FixtureTrack): ProviderTrack {
    return {
      sourceId: fixture.id,
      title: fixture.title,
      artists: fixture.artists,
      ...(fixture.durationMs === undefined
        ? {}
        : { durationMs: fixture.durationMs }),
    };
  }
}
