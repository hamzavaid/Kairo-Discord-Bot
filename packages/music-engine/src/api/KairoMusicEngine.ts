import { MusicError } from './errors.js';
import type { KairoMusicEvent, Unsubscribe } from './events.js';
import type { FixtureTrack, ParseRequest, ParseResult } from './requests.js';
import { classifyQuery } from '../parser/QueryClassifier.js';
import { normalizeQuery } from '../parser/QueryNormalizer.js';
import { normalizeProviderTrack } from '../parser/TrackNormalizer.js';
import { FixtureProvider } from '../providers/FixtureProvider.js';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';

export interface EngineOptions {
  fixtureTracks?: FixtureTrack[];
  providerPriority?: string[];
}

export interface KairoMusicEngine {
  parse(request: ParseRequest): Promise<ParseResult>;
  on<T extends KairoMusicEvent['type']>(
    type: T,
    listener: (event: Extract<KairoMusicEvent, { type: T }>) => void,
  ): Unsubscribe;
  shutdown(): Promise<void>;
}

export function createKairoMusicEngine(
  options: EngineOptions = {},
): KairoMusicEngine {
  const registry = new ProviderRegistry(options.providerPriority);
  registry.register(new FixtureProvider(options.fixtureTracks ?? []));
  const listeners = new Map<
    KairoMusicEvent['type'],
    Set<(event: KairoMusicEvent) => void>
  >();

  function emit(event: KairoMusicEvent): void {
    for (const listener of listeners.get(event.type) ?? []) {
      try {
        listener(event);
      } catch {
        // A client callback cannot change the parser result or suppress other subscribers.
      }
    }
  }

  return {
    async parse(request) {
      const eventContext = {
        guildId: request.guildId,
        requestedBy: request.requestedBy,
        ...(request.requestId === undefined
          ? {}
          : { requestId: request.requestId }),
      };
      try {
        if (!request.guildId || !request.requestedBy) {
          throw new MusicError(
            'INVALID_QUERY',
            'A guild and requester are required.',
          );
        }
        const maxResults = request.maxResults ?? 10;
        if (
          !Number.isInteger(maxResults) ||
          maxResults < 1 ||
          maxResults > 25
        ) {
          throw new MusicError(
            'INVALID_QUERY',
            'Choose between 1 and 25 results.',
          );
        }
        const classified = classifyQuery(normalizeQuery(request.input));
        let result: ParseResult;
        if (classified.kind === 'provider-track') {
          const provider = registry.providerFor(classified);
          const payload = await provider.parse(classified);
          result = {
            kind: 'track',
            track: normalizeProviderTrack(payload, {
              providerId: provider.id,
              input: request.input,
              requestedBy: request.requestedBy,
              parsedBy: provider.id,
              canonicalUrl: classified.canonicalUrl,
            }),
          };
        } else {
          const candidates = [];
          for (const provider of registry.searchableProviders()) {
            if (!provider.search) continue;
            const payloads = await provider.search(
              classified.query,
              maxResults - candidates.length,
            );
            for (const payload of payloads) {
              candidates.push(
                normalizeProviderTrack(payload, {
                  providerId: provider.id,
                  input: request.input,
                  requestedBy: request.requestedBy,
                  parsedBy: 'search',
                }),
              );
              if (candidates.length === maxResults) break;
            }
            if (candidates.length === maxResults) break;
          }
          if (candidates.length === 0) {
            throw new MusicError(
              'NO_SEARCH_RESULTS',
              'No matching song was found.',
            );
          }
          result = { kind: 'search', candidates };
        }
        emit({
          type: 'parseSucceeded',
          ...eventContext,
          resultKind: result.kind,
        });
        return result;
      } catch (error) {
        const safeError =
          error instanceof MusicError
            ? new MusicError(
                error.code,
                error.message,
                error.retryable,
                request.requestId,
              )
            : new MusicError(
                'PROVIDER_PARSE_ERROR',
                'The music source returned invalid metadata.',
                false,
                request.requestId,
              );
        emit({ type: 'parseFailed', ...eventContext, code: safeError.code });
        throw safeError;
      }
    },
    on(type, listener) {
      const bucket =
        listeners.get(type) ?? new Set<(event: KairoMusicEvent) => void>();
      listeners.set(type, bucket);
      const handler = listener as (event: KairoMusicEvent) => void;
      bucket.add(handler);
      return () => bucket.delete(handler);
    },
    async shutdown() {
      listeners.clear();
    },
  };
}
