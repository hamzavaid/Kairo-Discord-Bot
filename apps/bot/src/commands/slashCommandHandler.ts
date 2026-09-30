import { MusicError } from '@kairo/music-engine';
import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { CommandError } from '../errors.js';
import { AuditLog } from './AuditLog.js';
import type {
  CommandContext,
  CommandDefinition,
  CommandReply,
  CommandRequest,
} from './types.js';

type ErrorReporter = (
  error: unknown,
  context: {
    command: string;
    guildId?: string;
    userId: string;
    code: string;
  },
) => void;

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

async function respond(
  interaction: ChatInputCommandInteraction,
  message: CommandReply,
): Promise<void> {
  const options = {
    ...(message.content === undefined ? {} : { content: message.content }),
    ...(message.components === undefined
      ? {}
      : { components: message.components }),
    allowedMentions: { parse: [] as [] },
  };

  const flags =
    (message.flags ?? 0) | (message.ephemeral ? MessageFlags.Ephemeral : 0);

  if (interaction.deferred) {
    await interaction.editReply({
      ...options,
      ...(message.flags === MessageFlags.IsComponentsV2
        ? { flags: MessageFlags.IsComponentsV2 }
        : {}),
    });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({
      ...options,
      ...(flags ? { flags } : {}),
    });
    return;
  }

  await interaction.reply({
    ...options,
    ...(flags ? { flags } : {}),
  });
}

function createContext(
  interaction: ChatInputCommandInteraction,
  isDeveloper: boolean,
): CommandContext {
  const guildId = interaction.guildId ?? undefined;
  const voiceChannelId =
    interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId ??
    undefined;
  const query = interaction.options.getString('query');
  const page = interaction.options.getInteger('page');
  const timeoutSeconds = interaction.options.getInteger('timeout_seconds');
  const audioQuality = interaction.options.getString('audio_quality');

  return {
    name: interaction.commandName,
    userId: interaction.user.id,
    ...(guildId ? { guildId } : {}),
    ...(voiceChannelId ? { voiceChannelId } : {}),
    ...(guildId && voiceChannelId && interaction.guild
      ? {
          voiceTarget: {
            guildId,
            channelId: voiceChannelId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
          },
        }
      : {}),
    ...(query === null ? {} : { query }),
    ...(page === null ? {} : { page }),
    ...(timeoutSeconds === null ? {} : { timeoutSeconds }),
    ...(audioQuality === null
      ? {}
      : {
          audioQuality: audioQuality as NonNullable<
            CommandRequest['audioQuality']
          >,
        }),
    canManageGuild:
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
      false,
    createdTimestamp: interaction.createdTimestamp,
    websocketPing: interaction.client.ws.ping,
    async defer() {
      if (!interaction.deferred && !interaction.replied)
        await interaction.deferReply();
    },
    async respond(reply) {
      await respond(interaction, reply);
    },
    isDeveloper,
  };
}

export async function executeSlashCommand(
  interaction: ChatInputCommandInteraction,
  command: CommandDefinition | undefined,
  audit: AuditLog,
  developerIds: ReadonlySet<string>,
  reportError?: ErrorReporter,
): Promise<void> {
  const started = Date.now();
  const commandName = interaction.commandName;
  const userId = interaction.user.id;
  const guildId = interaction.guildId ?? undefined;

  let success = false;
  let errorCode: string | undefined;
  let reply: CommandReply;

  try {
    if (!command) throw new CommandError('MISSING_QUERY', 'Unknown command.');

    const isDeveloper = developerIds.has(userId);

    if (command.developerOnly && !isDeveloper)
      throw new CommandError(
        'UNAUTHORIZED',
        'You are not authorized to use this command.',
      );

    if (command.defer && !interaction.deferred && !interaction.replied)
      await interaction.deferReply();

    reply = await command.execute(createContext(interaction, isDeveloper));
  } catch (error) {
    const safe = safeFailure(error);
    errorCode = safe.code;

    try {
      reportError?.(error, {
        command: commandName,
        ...(guildId ? { guildId } : {}),
        userId,
        code: safe.code,
      });
    } catch {
      // Logging must never prevent a safe command response.
    }

    reply = {
      content: safe.message,
      ephemeral: true,
    };
  }

  try {
    await respond(interaction, reply);
    success = errorCode === undefined;
  } catch (error) {
    errorCode ??= 'INTERACTION_RESPONSE_ERROR';

    try {
      reportError?.(error, {
        command: commandName,
        ...(guildId ? { guildId } : {}),
        userId,
        code: errorCode,
      });
    } catch {
      // Do not attempt another interaction response here.
    }
  } finally {
    audit.record({
      command: commandName,
      ...(guildId ? { guildId } : {}),
      userId,
      timestamp: new Date(started).toISOString(),
      success,
      durationMs: Math.max(0, Date.now() - started),
      ...(errorCode ? { errorCode } : {}),
    });
  }
}
