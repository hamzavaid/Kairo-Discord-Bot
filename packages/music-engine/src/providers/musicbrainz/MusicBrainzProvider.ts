import { MusicError } from '../../api/errors.js';
import type { MusicBrainzOptions } from '../../api/MusicBrainzOptions.js';
import type { ClassifiedInput } from '../../parser/QueryClassifier.js';
import type { MediaProvider, ProviderTrack } from '../MediaProvider.js';
import { RequestGate, realSleep, type Sleep } from './RequestGate.js';
import { parseRecording, parseSearch } from './schema.js';
import { TimedCache } from './TimedCache.js';

interface InternalOptions extends MusicBrainzOptions {
  now?: () => number;
  sleep?: Sleep;
  minIntervalMs?: number;
  maxAttempts?: number;
}

const API_ROOT = 'https://musicbrainz.org/ws/2/recording';
const MAX_RESPONSE_BYTES = 512 * 1024;
const liveGate = new RequestGate(1000, Date.now, realSleep);

function aborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function validContact(contact: string): boolean {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact)) return true;
  try {
    const url = new URL(contact);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

export class MusicBrainzProvider implements MediaProvider {
  readonly id = 'musicbrainz';
  readonly capabilities = { search: true, trackUrl: true };
  private readonly fetcher: NonNullable<MusicBrainzOptions['fetcher']>;
  private readonly now: () => number;
  private readonly sleep: Sleep;
  private readonly gate: RequestGate;
  private readonly searchCache: TimedCache<ProviderTrack[]>;
  private readonly metadataCache: TimedCache<ProviderTrack>;
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly timeoutMs: number;
  private readonly searchCacheMs: number;
  private readonly metadataCacheMs: number;
  private readonly maxAttempts: number;
  private failures = 0;
  private openUntil = 0;

  constructor(private readonly options: InternalOptions) {
    if (!validContact(options.contact)) {
      throw new Error(
        'MusicBrainz requires a contact URL or email for its User-Agent.',
      );
    }
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? realSleep;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.searchCacheMs = options.searchCacheMs ?? 300_000;
    this.metadataCacheMs = options.metadataCacheMs ?? 21_600_000;
    this.maxAttempts = options.maxAttempts ?? 2;
    if (
      this.timeoutMs < 1 ||
      this.maxAttempts < 1 ||
      this.maxAttempts > 3 ||
      this.searchCacheMs < 0 ||
      this.metadataCacheMs < 0
    ) {
      throw new Error('Invalid MusicBrainz provider limits.');
    }
    this.gate =
      options.fetcher === undefined &&
      options.now === undefined &&
      options.sleep === undefined &&
      options.minIntervalMs === undefined
        ? liveGate
        : new RequestGate(options.minIntervalMs ?? 1000, this.now, this.sleep);
    this.searchCache = new TimedCache(256, this.now);
    this.metadataCache = new TimedCache(256, this.now);
  }

  canParse(input: ClassifiedInput): boolean {
    return input.kind === 'provider-track' && input.providerId === this.id;
  }

  async parse(
    input: ClassifiedInput,
    signal?: AbortSignal,
  ): Promise<ProviderTrack> {
    if (input.kind !== 'provider-track' || !this.canParse(input)) {
      throw new MusicError(
        'UNSUPPORTED_PROVIDER',
        'This music source is not supported.',
      );
    }
    const cached = this.metadataCache.get(input.sourceId);
    if (cached) return cached;
    return this.load(`recording:${input.sourceId}`, async () => {
      const url = new URL(`${API_ROOT}/${input.sourceId}`);
      url.searchParams.set('fmt', 'json');
      url.searchParams.set('inc', 'artist-credits');
      const track = parseRecording(await this.fetchJson(url, signal));
      this.metadataCache.set(input.sourceId, track, this.metadataCacheMs);
      return track;
    });
  }

  async search(
    query: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<ProviderTrack[]> {
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 25) {
      throw new MusicError('INVALID_QUERY', 'Choose between 1 and 25 results.');
    }
    const key = `${query.toLocaleLowerCase('en')}|${maxResults}`;
    const cached = this.searchCache.get(key);
    if (cached) return cached;
    return this.load(`search:${key}`, async () => {
      const url = new URL(API_ROOT);
      url.searchParams.set('query', query);
      url.searchParams.set('fmt', 'json');
      url.searchParams.set('limit', String(maxResults));
      url.searchParams.set('dismax', 'true');
      const tracks = parseSearch(await this.fetchJson(url, signal));
      this.searchCache.set(key, tracks, this.searchCacheMs);
      return tracks;
    });
  }

  private async load<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const work = operation()
      .then((value) => {
        this.failures = 0;
        return value;
      })
      .catch((error: unknown) => {
        if (!(
          error instanceof MusicError &&
          (error.code === 'NO_SEARCH_RESULTS' ||
            error.code === 'PARSER_CANCELLED')
        )) {
          this.failures += 1;
          if (this.failures >= 3) this.openUntil = this.now() + 30_000;
        }
        throw error;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async fetchJson(url: URL, signal?: AbortSignal): Promise<unknown> {
    if (this.now() < this.openUntil) {
      throw new MusicError(
        'PROVIDER_UNAVAILABLE',
        'The music source is temporarily unavailable.',
        true,
      );
    }
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.fetchOnce(url, signal);
      } catch (error) {
        const safe =
          error instanceof MusicError
            ? error
            : new MusicError(
                'PROVIDER_UNAVAILABLE',
                'The music source is temporarily unavailable.',
                true,
              );
        if (!safe.retryable || attempt === this.maxAttempts) throw safe;
        try {
          await this.sleep(250 * attempt, signal);
        } catch {
          if (signal?.aborted)
            throw new MusicError(
              'PARSER_CANCELLED',
              'The music request was cancelled.',
            );
          throw new MusicError(
            'PROVIDER_UNAVAILABLE',
            'The music source is temporarily unavailable.',
            true,
          );
        }
      }
    }
    throw new MusicError(
      'PROVIDER_UNAVAILABLE',
      'The music source is temporarily unavailable.',
      true,
    );
  }

  private async fetchOnce(
    url: URL,
    requestSignal?: AbortSignal,
  ): Promise<unknown> {
    const startedAt = this.now();
    const operation = url.pathname.endsWith('/recording') ? 'search' : 'lookup';
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    const signal = requestSignal
      ? AbortSignal.any([requestSignal, timeout.signal])
      : timeout.signal;
    try {
      await this.gate.wait(signal);
      const response = await aborted(
        this.fetcher(url.toString(), {
          headers: {
            Accept: 'application/json',
            'User-Agent': `Kairo/0.1.0 (${this.options.contact})`,
          },
          redirect: 'error',
          signal,
        }),
        signal,
      );
      if (response.redirected)
        throw new MusicError(
          'PROVIDER_UNAVAILABLE',
          'The music source redirected unexpectedly.',
        );
      if (response.status === 404)
        throw new MusicError(
          'NO_SEARCH_RESULTS',
          'No matching song was found.',
        );
      if (!response.ok) {
        throw new MusicError(
          'PROVIDER_UNAVAILABLE',
          'The music source is temporarily unavailable.',
          response.status === 429 || response.status >= 500,
        );
      }
      const payload = await this.readJson(response, signal);
      this.options.logger?.info(
        {
          provider: this.id,
          operation,
          status: response.status,
          latencyMs: this.now() - startedAt,
        },
        'MusicBrainz request completed',
      );
      return payload;
    } catch (error) {
      const safe = requestSignal?.aborted
        ? new MusicError('PARSER_CANCELLED', 'The music request was cancelled.')
        : timeout.signal.aborted
          ? new MusicError(
              'PROVIDER_TIMEOUT',
              'The music source timed out.',
              true,
            )
          : error instanceof MusicError
            ? error
            : new MusicError(
                'PROVIDER_UNAVAILABLE',
                'The music source is temporarily unavailable.',
                true,
              );
      this.options.logger?.warn(
        {
          provider: this.id,
          operation,
          code: safe.code,
          latencyMs: this.now() - startedAt,
        },
        'MusicBrainz request failed',
      );
      throw safe;
    } finally {
      clearTimeout(timer);
    }
  }

  private async readJson(
    response: Response,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    }
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_RESPONSE_BYTES || !response.body) {
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await aborted(reader.read(), signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          throw new MusicError(
            'PROVIDER_PARSE_ERROR',
            'The music source returned invalid metadata.',
          );
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof MusicError) throw error;
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    } finally {
      void reader.cancel().catch(() => {});
    }
  }
}
