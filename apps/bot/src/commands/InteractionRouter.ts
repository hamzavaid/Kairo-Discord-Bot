import { MusicError } from '@kairo/music-engine';
import type { CommandRequest } from './types.js';
import { CommandError } from '../errors.js';
import { AuditLog } from './AuditLog.js';
import { ApplicationCommandRegistry } from './registry.js';

function safeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof CommandError)
    return { code: error.code, message: error.message };
  if (error instanceof MusicError) {
    const messages: Partial<Record<MusicError['code'], string>> = {
      QUEUE_EMPTY: 'The queue is empty.',
      NO_SEARCH_RESULTS: 'No matching song was found.',
      NO_RELIABLE_MATCH: 'No reliable match was found.',
      STREAM_UNAVAILABLE: 'This song has no playable audio source.',
      VOICE_JOIN_ERROR: 'Could not join the voice channel.',
      INVALID_PLAYBACK_TRANSITION: 'Playback is not in the required state.',
      PROVIDER_TIMEOUT: 'The metadata provider timed out.',
      PROVIDER_UNAVAILABLE: 'The metadata provider is unavailable.',
      PROVIDER_PARSE_ERROR: 'The metadata provider returned invalid data.',
    };
    return {
      code: error.code,
      message: messages[error.code] ?? 'The music request failed.',
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: 'The command could not be completed.',
  };
}

/** One route for execution, error responses, and bounded audit entries. */
export class InteractionRouter {
  constructor(
    private readonly registry: ApplicationCommandRegistry,
    private readonly audit: AuditLog,
    private readonly developerIds: ReadonlySet<string>,
  ) {}

  async execute(request: CommandRequest): Promise<void> {
    const started = Date.now();
    let success = false;
    let errorCode: string | undefined;
    try {
      const command = this.registry.get(request.name);
      if (!command) throw new CommandError('MISSING_QUERY', 'Unknown command.');
      const isDeveloper = this.developerIds.has(request.userId);
      if (command.developerOnly && !isDeveloper)
        throw new CommandError(
          'UNAUTHORIZED',
          'You are not authorized to use this command.',
        );
      if (command.defer) await request.defer();
      const reply = await command.execute({ ...request, isDeveloper });
      await request.respond(reply.content, reply.ephemeral ?? false);
      success = true;
    } catch (error) {
      const safe = safeFailure(error);
      errorCode = safe.code;
      await request.respond(safe.message, true);
    } finally {
      this.audit.record({
        command: request.name,
        ...(request.guildId ? { guildId: request.guildId } : {}),
        userId: request.userId,
        timestamp: new Date(started).toISOString(),
        success,
        durationMs: Math.max(0, Date.now() - started),
        ...(errorCode ? { errorCode } : {}),
      });
    }
  }
}
