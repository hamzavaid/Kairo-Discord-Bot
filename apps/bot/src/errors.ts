export class CommandError extends Error {
  constructor(
    readonly code:
      | 'USER_NOT_IN_VOICE'
      | 'WRONG_VOICE_CHANNEL'
      | 'UNAUTHORIZED'
      | 'GUILD_ONLY'
      | 'MISSING_QUERY',
    message: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}
