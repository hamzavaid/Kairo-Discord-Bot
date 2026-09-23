import { MusicError } from './errors.js';
import type { FixtureTrack, ParseRequest, ParseResult } from './requests.js';
import { classifyQuery } from '../parser/QueryClassifier.js';
import { normalizeQuery } from '../parser/QueryNormalizer.js';
import { FixtureProvider } from '../providers/FixtureProvider.js';

export interface EngineOptions {
  fixtureTracks?: FixtureTrack[];
}

export interface KairoMusicEngine {
  parse(request: ParseRequest): Promise<ParseResult>;
  shutdown(): Promise<void>;
}

export function createKairoMusicEngine(
  options: EngineOptions = {},
): KairoMusicEngine {
  const fixtures = new FixtureProvider(options.fixtureTracks ?? []);
  return {
    async parse(request) {
      if (!request.guildId || !request.requestedBy) {
        throw new MusicError(
          'INVALID_QUERY',
          'A guild and requester are required.',
        );
      }
      const maxResults = request.maxResults ?? 10;
      if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 25) {
        throw new MusicError(
          'INVALID_QUERY',
          'Choose between 1 and 25 results.',
        );
      }
      const normalized = normalizeQuery(request.input);
      const classified = classifyQuery(normalized);
      if (classified.kind === 'fixture-track') {
        return {
          kind: 'track',
          track: fixtures.get(
            classified.id,
            request.input,
            request.requestedBy,
            classified.canonicalUrl,
          ),
        };
      }
      const candidates = fixtures.search(
        classified.query,
        request.input,
        request.requestedBy,
        maxResults,
      );
      if (candidates.length === 0)
        throw new MusicError(
          'NO_SEARCH_RESULTS',
          'No matching song was found.',
        );
      return { kind: 'search', candidates };
    },
    async shutdown() {},
  };
}
