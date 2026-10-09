export type MusicErrorCode =
  | 'COLLECTION_UNSUPPORTED'
  | 'COLLECTION_EMPTY'
  | 'COLLECTION_IMPORT_FAILED'
  | 'INVALID_QUERY'
  | 'UNSUPPORTED_PROVIDER'
  | 'NO_SEARCH_RESULTS'
  | 'PROVIDER_PARSE_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PARSER_CANCELLED'
  | 'PROVIDER_CONFIGURATION_ERROR'
  | 'PROVIDER_AUTH_REQUIRED'
  | 'PROVIDER_ACCESS_DENIED'
  | 'NO_RELIABLE_MATCH'
  | 'QUEUE_EMPTY'
  | 'QUEUE_LIMIT'
  | 'INVALID_QUEUE_POSITION'
  | 'INVALID_PLAYBACK_TRANSITION'
  | 'STREAM_UNAVAILABLE'
  | 'STREAM_CANCELLED'
  | 'VOICE_JOIN_ERROR'
  | 'STREAM_TIMEOUT'
  | 'FFMPEG_ERROR';

export interface ProviderDiagnostics {
  provider?: string;
  operation?: string;
  httpStatus?: number;
  reason?: 'http-error' | 'invalid-response' | 'response-too-large';
}

export class MusicError extends Error {
  constructor(
    readonly code: MusicErrorCode,
    message: string,
    readonly retryable = false,
    readonly correlationId?: string,
    readonly diagnostics?: ProviderDiagnostics,
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
