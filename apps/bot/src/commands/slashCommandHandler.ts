import { MusicError } from '@kairo/music-engine';
import { LibraryError } from '@kairo/data';
import {
  Collection,
  MessageFlags,
  Routes,
  type ChatInputCommandInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { CommandError } from '../errors.js';
import auditlogCommand from './developer/auditlog.js';
import disconnectCommand from './music/disconnect.js';
import pauseCommand from './music/pause.js';
import playCommand from './music/play.js';
import queueCommand from './music/queue.js';
import resumeCommand from './music/resume.js';
import skipCommand from './music/skip.js';
import stopCommand from './music/stop.js';
import type {
  CommandExecutionContext,
  CommandServices,
  SlashCommand,
} from './types.js';
import helpCommand from './utility/help.js';
import infoCommand from './utility/info.js';
import pingCommand from './utility/ping.js';
import settingsCommand from './utility/settings.js';
import playlistCommand from './library/playlist.js';
import likedCommand from './library/liked.js';
import likeCommand from './library/like.js';
import dislikeCommand from './library/dislike.js';
import menuCommand from './library/menu.js';

export type ErrorReporter = (
  error: unknown,
  context: {
    command: string;
    guildId?: string;
    userId: string;
    code: string;
  },
) => void;

export interface SlashCommandHandlerOptions extends CommandServices {
  developerIds: ReadonlySet<string>;
  reportError?: ErrorReporter;
}

export interface CommandRegistrationTransport {
  put(
    route: string,
    options: {
      body: RESTPostAPIChatInputApplicationCommandsJSONBody[];
    },
  ): Promise<unknown>;
}

function safeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof LibraryError)
    return { code: error.code, message: error.message };
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
      COLLECTION_UNSUPPORTED:
        'Enter a supported YouTube playlist or Spotify playlist/album URL.',
      COLLECTION_EMPTY: 'The collection has no importable tracks.',
      COLLECTION_IMPORT_FAILED:
        'The collection could not be imported. Check its availability and provider permissions.',
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

function isInteractionResponseError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === 10062 || code === 40060;
}

async function sendFailure(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply({ content: message, components: [] });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: message,
    flags: MessageFlags.Ephemeral,
  });
}

const builtInCommands: readonly SlashCommand[] = [
  playCommand,
  pauseCommand,
  resumeCommand,
  skipCommand,
  stopCommand,
  disconnectCommand,
  queueCommand,
  pingCommand,
  settingsCommand,
  helpCommand,
  infoCommand,
  auditlogCommand,
  playlistCommand,
  likedCommand,
  likeCommand,
  dislikeCommand,
  menuCommand,
];

export class SlashCommandHandler {
  readonly commands = new Collection<string, SlashCommand>();
  private readonly nicknames = new Map<string, SlashCommand>();

  constructor(private readonly options: SlashCommandHandlerOptions) {
    for (const command of builtInCommands) {
      if (this.commands.has(command.data.name))
        throw new Error(`Duplicate command: ${command.data.name}`);
      this.commands.set(command.data.name, command);
    }
    for (const command of this.commands.values()) {
      for (const nickname of command.nicknames ?? []) {
        if (!/^[a-z0-9_-]{1,32}$/u.test(nickname))
          throw new Error(`Invalid command nickname: ${nickname}`);
        if (this.commands.has(nickname) || this.nicknames.has(nickname))
          throw new Error(`Duplicate command: ${nickname}`);
        this.nicknames.set(nickname, command);
      }
    }
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name) ?? this.nicknames.get(name);
  }

  list(): SlashCommand[] {
    return [...this.commands.values()];
  }

  names(): string[] {
    return this.list().flatMap((command) => [
      command.data.name,
      ...(command.nicknames ?? []),
    ]);
  }

  registrationData(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
    return this.list().flatMap((command) => {
      const data = command.data.toJSON();
      return [
        data,
        ...(command.nicknames ?? []).map((name) => {
          const alias = { ...data, name };
          // Parent name translations must not turn the alias back into the parent.
          delete alias.name_localizations;
          return alias;
        }),
      ];
    });
  }

  async register(
    transport: CommandRegistrationTransport,
    clientId: string,
    devGuildId?: string,
  ): Promise<void> {
    const route = devGuildId
      ? Routes.applicationGuildCommands(clientId, devGuildId)
      : Routes.applicationCommands(clientId);
    await transport.put(route, { body: this.registrationData() });
  }

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const started = Date.now();
    const commandName = interaction.commandName;
    const userId = interaction.user.id;
    const guildId = interaction.guildId ?? undefined;
    const command = this.get(commandName);

    let success = false;
    let errorCode: string | undefined;

    try {
      if (!command) throw new CommandError('MISSING_QUERY', 'Unknown command.');

      const isDeveloper = this.options.developerIds.has(userId);
      if (command.developerOnly && !isDeveloper)
        throw new CommandError(
          'UNAUTHORIZED',
          'You are not authorized to use this command.',
        );

      const context: CommandExecutionContext = {
        music: this.options.music,
        audit: this.options.audit,
        settings: this.options.settings,
        ...(this.options.library ? { library: this.options.library } : {}),
        ...(this.options.onSettingsChanged
          ? { onSettingsChanged: this.options.onSettingsChanged }
          : {}),
        ...(this.options.onVoiceActivity
          ? { onVoiceActivity: this.options.onVoiceActivity }
          : {}),
        isDeveloper,
        commands: this.commands,
        componentErrorMessage: (error) => safeFailure(error).message,
        reportComponentError: (error) => {
          const safe = safeFailure(error);
          this.report(error, commandName, guildId, userId, safe.code);
          this.options.audit.record({
            command: `${commandName}:component`,
            ...(guildId ? { guildId } : {}),
            userId,
            timestamp: new Date().toISOString(),
            success: false,
            durationMs: 0,
            errorCode: safe.code,
          });
        },
      };

      await command.execute(interaction, context);
      success = true;
    } catch (error) {
      if (isInteractionResponseError(error)) {
        errorCode = 'INTERACTION_RESPONSE_ERROR';
        this.report(error, commandName, guildId, userId, errorCode);
      } else {
        const safe = safeFailure(error);
        errorCode = safe.code;
        this.report(error, commandName, guildId, userId, safe.code);

        try {
          await sendFailure(interaction, safe.message);
        } catch (responseError) {
          errorCode = 'INTERACTION_RESPONSE_ERROR';
          this.report(responseError, commandName, guildId, userId, errorCode);
        }
      }
    } finally {
      this.options.audit.record({
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

  private report(
    error: unknown,
    command: string,
    guildId: string | undefined,
    userId: string,
    code: string,
  ): void {
    try {
      this.options.reportError?.(error, {
        command,
        ...(guildId ? { guildId } : {}),
        userId,
        code,
      });
    } catch {
      // Logging must never prevent command handling.
    }
  }
}

export function createSlashCommandHandler(
  options: SlashCommandHandlerOptions,
): SlashCommandHandler {
  return new SlashCommandHandler(options);
}
