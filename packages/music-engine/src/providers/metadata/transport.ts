import { MusicError } from '../../api/errors.js';

const MAX_BYTES = 512 * 1024;

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
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

export async function boundedJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  requestSignal?: AbortSignal,
): Promise<unknown> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, timeout.signal])
    : timeout.signal;
  try {
    const response = await abortable(
      fetcher(url, { ...init, redirect: 'error', signal }),
      signal,
    );
    if (response.status === 404)
      throw new MusicError('NO_SEARCH_RESULTS', 'No matching song was found.');
    if (!response.ok)
      throw new MusicError(
        'PROVIDER_UNAVAILABLE',
        'The music source is temporarily unavailable.',
        response.status === 429 || response.status >= 500,
      );
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    if (
      !response.body ||
      Number(response.headers.get('content-length')) > MAX_BYTES
    )
      throw new MusicError(
        'PROVIDER_PARSE_ERROR',
        'The music source returned invalid metadata.',
      );
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = '';
    let bytes = 0;
    try {
      while (true) {
        const chunk = await abortable(reader.read(), signal);
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES)
          throw new MusicError(
            'PROVIDER_PARSE_ERROR',
            'The music source returned invalid metadata.',
          );
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new MusicError(
          'PROVIDER_PARSE_ERROR',
          'The music source returned invalid metadata.',
        );
      }
    } finally {
      void reader.cancel().catch(() => {});
    }
  } catch (error) {
    if (requestSignal?.aborted)
      throw new MusicError(
        'PARSER_CANCELLED',
        'The music request was cancelled.',
      );
    if (timeout.signal.aborted)
      throw new MusicError(
        'PROVIDER_TIMEOUT',
        'The music source timed out.',
        true,
      );
    if (error instanceof MusicError) throw error;
    throw new MusicError(
      'PROVIDER_UNAVAILABLE',
      'The music source is temporarily unavailable.',
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}
