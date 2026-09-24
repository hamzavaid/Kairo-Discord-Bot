export type MusicErrorCode =
  | 'INVALID_QUERY'
  | 'UNSUPPORTED_PROVIDER'
  | 'NO_SEARCH_RESULTS'
  | 'PROVIDER_PARSE_ERROR';

export class MusicError extends Error {
  constructor(
    readonly code: MusicErrorCode,
    message: string,
    readonly retryable = false,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'MusicError';
  }
}
