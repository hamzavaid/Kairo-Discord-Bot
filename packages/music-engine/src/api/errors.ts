export type MusicErrorCode =
  'INVALID_QUERY' | 'UNSUPPORTED_PROVIDER' | 'NO_SEARCH_RESULTS';

export class MusicError extends Error {
  constructor(
    readonly code: MusicErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'MusicError';
  }
}
