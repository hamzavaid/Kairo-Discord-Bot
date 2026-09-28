export type MusicErrorCode =
  | 'INVALID_QUERY'
  | 'UNSUPPORTED_PROVIDER'
  | 'NO_SEARCH_RESULTS'
  | 'PROVIDER_PARSE_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PARSER_CANCELLED'
  | 'PROVIDER_CONFIGURATION_ERROR'
  | 'NO_RELIABLE_MATCH'
  | 'QUEUE_EMPTY'
  | 'QUEUE_LIMIT'
  | 'INVALID_QUEUE_POSITION';

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

export class NoReliableMatchError extends MusicError {
  constructor(correlationId?: string) {
    super(
      'NO_RELIABLE_MATCH',
      'No reliable match was found for this song.',
      false,
      correlationId,
    );
    this.name = 'NoReliableMatchError';
  }
}
