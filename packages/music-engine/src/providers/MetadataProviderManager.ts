import { MusicError } from '../api/errors.js';
import type { MetadataProviderId } from '../api/MetadataOptions.js';
import type { ClassifiedInput } from '../parser/QueryClassifier.js';
import { validateProviderTrack } from '../parser/TrackNormalizer.js';
import type {
  MediaProvider,
  ProviderTrack,
  ProviderCollection,
} from './MediaProvider.js';
import { ProviderRegistry } from './ProviderRegistry.js';
import { ProviderSupervisor } from '../reliability/ProviderSupervisor.js';

export interface MetadataResponse<T> {
  provider: MediaProvider;
  value: T;
}

/** Owns selection and fallback. URL identity always wins over search preference. */
export class MetadataProviderManager {
  readonly handlesRetries = true;
  async collection(
    input: Extract<ClassifiedInput, { kind: 'provider-collection' }>,
    limit: number,
    signal?: AbortSignal,
  ): Promise<MetadataResponse<ProviderCollection>> {
    const id =
      input.providerId === 'youtube-sr' && this.selected === 'youtube-api'
        ? 'youtube-api'
        : input.providerId;
    const provider = this.registry.getMetadataProvider(id);
    if (!provider.getCollection)
      throw new MusicError(
        'COLLECTION_UNSUPPORTED',
        'This collection provider is not supported.',
      );
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 20_000);
    const combined = signal
      ? AbortSignal.any([signal, timeout.signal])
      : timeout.signal;
    try {
      return {
        provider,
        value: await this.safe(
          provider.id,
          (active) =>
            provider.getCollection!(
              { ...input, providerId: id },
              limit,
              active,
            ),
          combined,
        ),
      };
    } catch (error) {
      if (signal?.aborted)
        throw new MusicError(
          'PARSER_CANCELLED',
          'The music request was cancelled.',
        );
      if (timeout.signal.aborted)
        throw new MusicError(
          'PROVIDER_TIMEOUT',
          'The collection provider timed out.',
          true,
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly selected: MetadataProviderId,
    private readonly fallback: readonly MetadataProviderId[],
    private readonly fixtureOverride = false,
    private readonly supervisor = new ProviderSupervisor(),
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
      provider.id,
      (active) => provider.parse({ ...input, providerId: id }, active),
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
          provider.id,
          (active) => provider.search!(query, maxResults, active),
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

  /** Exact provider search for playable candidates; never applies the metadata fallback chain. */
  async searchOn(
    id: MetadataProviderId,
    query: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<MetadataResponse<ProviderTrack[]>> {
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
    const value = await this.safe(
      provider.id,
      (active) => provider.search!(query, maxResults, active),
      signal,
    );
    for (const track of value) validateProviderTrack(track);
    return { provider, value };
  }

  private async safe<T>(
    id: string,
    operation: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      return await this.supervisor.run(id, operation, signal);
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
