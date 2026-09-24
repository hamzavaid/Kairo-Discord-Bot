import { MusicError } from '../api/errors.js';
import type { ClassifiedInput } from '../parser/QueryClassifier.js';
import type { MediaProvider } from './MediaProvider.js';

export class ProviderRegistry {
  private readonly providers = new Map<string, MediaProvider>();

  constructor(private readonly priority: readonly string[] = []) {}

  register(provider: MediaProvider): void {
    if (!provider.id || this.providers.has(provider.id)) {
      throw new Error(`Duplicate or empty provider ID: ${provider.id}`);
    }
    if (provider.capabilities.search && !provider.search) {
      throw new Error(`Search provider ${provider.id} has no search method`);
    }
    this.providers.set(provider.id, provider);
  }

  getMetadataProvider(id: string): MediaProvider {
    const provider = this.providers.get(id);
    if (!provider)
      throw new MusicError(
        'UNSUPPORTED_PROVIDER',
        'This music source is not supported.',
      );
    return provider;
  }

  providerFor(input: ClassifiedInput): MediaProvider {
    if (input.kind !== 'provider-track') {
      throw new MusicError(
        'UNSUPPORTED_PROVIDER',
        'This music source is not supported.',
      );
    }
    const provider = this.getMetadataProvider(input.providerId);
    if (!provider.capabilities.trackUrl || !provider.canParse(input)) {
      throw new MusicError(
        'UNSUPPORTED_PROVIDER',
        'This music source is not supported.',
      );
    }
    return provider;
  }

  searchableProviders(): MediaProvider[] {
    const rank = (id: string) => {
      const index = this.priority.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...this.providers.values()]
      .filter((provider) => provider.capabilities.search && provider.search)
      .sort((left, right) => rank(left.id) - rank(right.id));
  }
}
