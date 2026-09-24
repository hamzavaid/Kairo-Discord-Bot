import { MusicError } from '../api/errors.js';
import type { MetadataProviderId } from '../api/MetadataOptions.js';
import type { ClassifiedInput } from '../parser/QueryClassifier.js';
import { validateProviderTrack } from '../parser/TrackNormalizer.js';
import type { MediaProvider, ProviderTrack } from './MediaProvider.js';
import { ProviderRegistry } from './ProviderRegistry.js';

export interface MetadataResponse<T> {
  provider: MediaProvider;
  value: T;
}

/** Owns selection and fallback. URL identity always wins over search preference. */
export class MetadataProviderManager {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly selected: MetadataProviderId,
    private readonly fallback: readonly MetadataProviderId[],
    private readonly fixtureOverride = false,
  ) {}

  async lookup(
    input: ClassifiedInput,
    signal?: AbortSignal,
  ): Promise<MetadataResponse<ProviderTrack>> {
    if (input.kind !== 'provider-track')
      throw new MusicError('INVALID_QUERY', 'Enter a song URL.');
    const id =
      input.providerId === 'youtube-sr' && this.selected === 'youtube-api'
        ? 'youtube-api'
        : input.providerId;
    const provider = this.registry.getMetadataProvider(id);
    if (
      !provider.capabilities.trackUrl ||
      !provider.canParse({ ...input, providerId: id })
    )
      throw new MusicError(
        'UNSUPPORTED_PROVIDER',
        'This music source is not supported.',
      );
    const value = await this.safe(
      () => provider.parse({ ...input, providerId: id }, signal),
      signal,
    );
    validateProviderTrack(value);
    return { provider, value };
  }

  async search(
    query: string,
    maxResults: number,
    preferred?: string,
    signal?: AbortSignal,
  ): Promise<MetadataResponse<ProviderTrack[]>> {
    const primary =
      preferred ?? (this.fixtureOverride ? 'fixture' : this.selected);
    const chain = [primary, ...this.fallback.filter((id) => id !== primary)];
    let last: MusicError | undefined;
    for (const id of chain) {
      if (signal?.aborted)
        throw new MusicError(
          'PARSER_CANCELLED',
          'The music request was cancelled.',
        );
      const provider = this.registry.getMetadataProvider(id);
      if (!provider.search)
        throw new MusicError(
          'UNSUPPORTED_PROVIDER',
          'This music source is not supported.',
        );
      try {
        const value = await this.safe(
          () => provider.search!(query, maxResults, signal),
          signal,
        );
        for (const track of value) validateProviderTrack(track);
        if (value.length) return { provider, value };
        last = new MusicError(
          'NO_SEARCH_RESULTS',
          'No matching song was found.',
        );
      } catch (error) {
        if (!(error instanceof MusicError)) throw error;
        if (error.code === 'PARSER_CANCELLED') throw error;
        last = error;
      }
    }
    throw (
      last ?? new MusicError('NO_SEARCH_RESULTS', 'No matching song was found.')
    );
  }

  private async safe<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted)
        throw new MusicError(
          'PARSER_CANCELLED',
          'The music request was cancelled.',
        );
      if (error instanceof MusicError) throw error;
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    }
  }
}
