import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../packages/music-engine/src/providers/ProviderRegistry.js';
import type { MediaProvider } from '../packages/music-engine/src/providers/MediaProvider.js';

function provider(
  id: string,
  searchable: boolean,
  parsesUrl = false,
): MediaProvider {
  return {
    id,
    capabilities: { search: searchable, trackUrl: parsesUrl },
    canParse: vi.fn(() => parsesUrl),
    parse: vi.fn(),
    ...(searchable ? { search: vi.fn() } : {}),
  };
}

describe('metadata provider registry', () => {
  it('orders searchable providers by configured priority and excludes non-searchable providers', () => {
    const registry = new ProviderRegistry(['second', 'first']);
    registry.register(provider('first', true));
    registry.register(provider('url-only', false, true));
    registry.register(provider('second', true));
    expect(registry.searchableProviders().map((item) => item.id)).toEqual([
      'second',
      'first',
    ]);
  });

  it('selects URL-capable providers and rejects duplicate identifiers', () => {
    const registry = new ProviderRegistry();
    const fixture = provider('fixture', true, true);
    registry.register(fixture);
    expect(
      registry.providerFor({
        kind: 'provider-track',
        providerId: 'fixture',
        sourceId: 'a',
        canonicalUrl: 'https://fixture.kairo.invalid/tracks/a',
      }),
    ).toBe(fixture);
    expect(() => registry.register(provider('fixture', true))).toThrow();
    expect(() => registry.getMetadataProvider('missing')).toThrow();
  });
});
