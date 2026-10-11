export class CommandError extends Error {
  constructor(
    readonly code:
      | 'USER_NOT_IN_VOICE'
      | 'WRONG_VOICE_CHANNEL'
      | 'UNAUTHORIZED'
      | 'GUILD_ONLY'
      | 'MISSING_QUERY'
      | 'STALE_PLAYER'
      | 'DJ_PERMISSION_REQUIRED'
      | 'VOTE_REQUIRED'
      | 'COMMAND_COOLDOWN'
      | 'CHANNEL_BLOCKED'
      | 'INVALID_SETTING'
      | 'HISTORY_EMPTY',
    message: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}
