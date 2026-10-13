import seekCommand from './music/seek.js';
import { GameError } from '@kairo/games';
import gamesCommand from './games/games.js';
import rpsCommand from './games/rps.js';
import hangmanCommand from './games/hangman.js';
import unoCommand from './games/uno.js';
import musictriviaCommand from './games/musictrivia.js';
import inviteToGameCommand from './context/InviteToGame.js';
import discoverCommand from './utility/discover.js';
import PlaySongCommand from './context/PlaySong.js';
import SearchMusicCommand from './context/SearchMusic.js';
import AddQueueCommand from './context/AddQueue.js';
import PlayNextCommand from './context/PlayNext.js';
import SongInfoCommand from './context/SongInfo.js';
import voteCommand from './music/vote.js';
import lyricsCommand from './music/lyrics.js';
import autoplayCommand from './music/autoplay.js';
import recommendCommand from './music/recommend.js';
import historyCommand from './music/history.js';
import statsCommand from './utility/stats.js';
import topCommand from './utility/top.js';
import { MusicError } from '@kairo/music-engine';
import { normalizeGuildControls, LibraryError } from '@kairo/data';
import {
  Collection,
  MessageFlags,
  Routes,
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
  type RESTPostAPIContextMenuApplicationCommandsJSONBody,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { CommandError } from '../errors.js';
import auditlogCommand from './developer/auditlog.js';
import disconnectCommand from './music/disconnect.js';
import pauseCommand from './music/pause.js';
import playCommand from './music/play.js';
import playNextCommand from './music/playnext.js';
import shuffleCommand from './music/shuffle.js';
import volumeCommand from './music/volume.js';
import repeatCommand from './music/repeat.js';
import filterCommand from './music/filter.js';
import playerCommand from './music/player.js';
import queueCommand from './music/queue.js';
import resumeCommand from './music/resume.js';
import skipCommand from './music/skip.js';
import stopCommand from './music/stop.js';
import type {
  CommandExecutionContext,
  CommandServices,
  SlashCommand,
  MessageCommand,
  UserCommand,
} from './types.js';
import type { PlaybackAction } from '../services/PlaybackPolicyService.js';
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
      body: ApplicationCommandDefinition[];
    },
  ): Promise<unknown>;
}

function safeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof GameError)
    return { code: error.code, message: error.message };
  if (error instanceof LibraryError)
    return { code: error.code, message: error.message };
  if (error instanceof CommandError)
    return { code: error.code, message: error.message };

  if (error instanceof MusicError) {
    const messages: Partial<Record<MusicError['code'], string>> = {
      QUEUE_EMPTY: 'The queue is empty.',
      INVALID_SEEK_POSITION: 'Use a valid timestamp within the track duration.',
      SEEK_UNSUPPORTED: 'Live or non-seekable audio cannot be seeked.',
      PLAYBACK_OWNED:
        'Music Trivia owns voice playback. End the game first, or stop/empty normal music before starting trivia.',
      PREVIEW_EXPIRED: 'The music preview session has expired.',
      QUEUE_ENTRY_NOT_FOUND:
        'That queue entry is no longer upcoming. Refresh the queue.',
      NO_SEARCH_RESULTS: 'No matching song was found.',
      NO_RELIABLE_MATCH: 'No reliable match was found.',
      STREAM_UNAVAILABLE: 'This song has no playable audio source.',
      VOICE_JOIN_ERROR: 'Could not join the voice channel.',
      INVALID_PLAYBACK_TRANSITION: 'Playback is not in the required state.',
      STALE_PLAYBACK: 'The song changed. Refresh the player and try again.',
      INVALID_VOLUME: 'Choose a volume from 0 to 100.',
      UNKNOWN_FILTER: 'Choose a supported filter preset.',
      PROVIDER_AUTH_REQUIRED:
        'This source requires account authorization. Ask the bot owner to authorize the music provider.',
      PROVIDER_ACCESS_DENIED:
        'The music provider denied access to this resource. Check the account permissions and playlist availability.',
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
  interaction: ExecutableInteraction,
  message: string,
): Promise<void> {
  if (interaction.replied) {
    await interaction.followUp({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.deferred) {
    await interaction.editReply({ content: message, components: [] });
    return;
  }

  await interaction.reply({
    content: message,
    flags: MessageFlags.Ephemeral,
  });
}

const builtInCommands: readonly SlashCommand[] = [
  playCommand,
  playNextCommand,
  shuffleCommand,
  playerCommand,
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
  volumeCommand,
  repeatCommand,
  filterCommand,
  historyCommand,
  statsCommand,
  topCommand,
  autoplayCommand,
  recommendCommand,
  lyricsCommand,
  voteCommand,
  discoverCommand,
  seekCommand,
  gamesCommand,
  rpsCommand,
  hangmanCommand,
  unoCommand,
  musictriviaCommand,
];

const builtInMessageCommands: readonly MessageCommand[] = [
  PlaySongCommand,
  SearchMusicCommand,
  AddQueueCommand,
  PlayNextCommand,
  SongInfoCommand,
];
export type ApplicationCommandDefinition =
  | RESTPostAPIChatInputApplicationCommandsJSONBody
  | RESTPostAPIContextMenuApplicationCommandsJSONBody;
type ExecutableInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;
function isMessageInteraction(
  i: ExecutableInteraction,
): i is MessageContextMenuCommandInteraction {
  return i.isMessageContextMenuCommand?.() === true;
}
/** Build deployment payloads without constructing runtime services. */
function isUserInteraction(
  i: ExecutableInteraction,
): i is UserContextMenuCommandInteraction {
  return i.isUserContextMenuCommand?.() === true;
}
export function commandRegistrationData(
  commands: readonly SlashCommand[] = builtInCommands,
  messageCommands: readonly (MessageCommand | UserCommand)[] = commands ===
  builtInCommands
    ? builtInMessageCommands
    : [],
): ApplicationCommandDefinition[] {
  const names = new Set<string>();
  for (const command of commands) {
    for (const name of [command.data.name, ...(command.nicknames ?? [])]) {
      if (!/^[a-z0-9_-]{1,32}$/u.test(name))
        throw new Error(`Invalid command nickname: ${name}`);
      if (names.has(name)) throw new Error(`Duplicate command: ${name}`);
      names.add(name);
    }
  }
  const slashData = commands.flatMap((command) => {
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
  const messageNames = new Set<string>();
  for (const command of messageCommands) {
    if (
      !command.data.name.trim() ||
      command.data.name.length > 32 ||
      messageNames.has(command.data.name)
    )
      throw new Error(
        `Duplicate or invalid message command: ${command.data.name}`,
      );
    messageNames.add(command.data.name);
  }
  return [
    ...slashData,
    ...messageCommands.map((command) => command.data.toJSON()),
  ];
}

export class SlashCommandHandler {
  readonly userCommands = new Collection<string, UserCommand>();
  readonly messageCommands = new Collection<string, MessageCommand>();
  readonly commands = new Collection<string, SlashCommand>();
  private readonly nicknames = new Map<string, SlashCommand>();

  constructor(private readonly options: SlashCommandHandlerOptions) {
    this.userCommands.set(inviteToGameCommand.data.name, inviteToGameCommand);
    for (const command of builtInMessageCommands)
      this.messageCommands.set(command.data.name, command);
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
    return [
      ...this.list().flatMap((command) => [
        command.data.name,
        ...(command.nicknames ?? []),
      ]),
      ...this.messageCommands.keys(),
      ...this.userCommands.keys(),
    ];
  }

  registrationData(): ApplicationCommandDefinition[] {
    return commandRegistrationData(this.list(), [
      ...this.messageCommands.values(),
      ...this.userCommands.values(),
    ]);
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

  async execute(interaction: ExecutableInteraction): Promise<void> {
    const started = Date.now();
    const commandName = interaction.commandName;
    const userId = interaction.user.id;
    const guildId = interaction.guildId ?? undefined;
    const command = isUserInteraction(interaction)
      ? this.userCommands.get(commandName)
      : isMessageInteraction(interaction)
        ? this.messageCommands.get(commandName)
        : this.get(commandName);

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

      if (this.options.policy && guildId && command.category !== 'Games') {
        const controls = normalizeGuildControls(
          (await this.options.settings.get(guildId)).controls,
        );
        this.options.policy.admit(
          guildId,
          userId,
          isMessageInteraction(interaction)
            ? this.messageCommands.get(commandName)!.admission
            : command.data.name,
          interaction.channelId,
          controls,
        );
        const name = command.data.name;
        const transports = [
          'seek',
          'pause',
          'resume',
          'skip',
          'stop',
          'disconnect',
          'shuffle',
        ];
        const mutateSetting =
          !isMessageInteraction(interaction) &&
          !isUserInteraction(interaction) &&
          ((name === 'volume' &&
            interaction.options.getInteger('amount') !== null) ||
            (name === 'repeat' &&
              interaction.options.getString('mode') !== null) ||
            (name === 'filter' &&
              interaction.options.getString('preset') !== 'status') ||
            (name === 'autoplay' &&
              ['on', 'off'].includes(
                interaction.options.getString('mode') ?? 'status',
              )));

        if (
          (transports.includes(name) && !this.options.controls) ||
          mutateSetting
        )
          await this.options.policy.authorize(
            interaction,
            this.options.music,
            this.options.settings,
            name === 'autoplay' ? 'repeat' : (name as PlaybackAction),
            this.options.music.queue(guildId).current?.enqueuedBy,
          );
      }
      const context: CommandExecutionContext = {
        music: this.options.music,
        ...(this.options.games ? { games: this.options.games } : {}),
        ...(this.options.discovery
          ? { discovery: this.options.discovery }
          : {}),
        ...(this.options.queueControls
          ? { queueControls: this.options.queueControls }
          : {}),
        ...(this.options.controls ? { controls: this.options.controls } : {}),
        ...(this.options.lyrics ? { lyrics: this.options.lyrics } : {}),
        ...(this.options.recommendations
          ? { recommendations: this.options.recommendations }
          : {}),
        ...(this.options.history ? { history: this.options.history } : {}),
        ...(this.options.statistics
          ? { statistics: this.options.statistics }
          : {}),
        ...(this.options.policy ? { policy: this.options.policy } : {}),
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
        reportComponentError: (error, actorUserId) => {
          const safe = safeFailure(error);
          this.report(
            error,
            commandName,
            guildId,
            actorUserId ?? userId,
            safe.code,
          );
          this.options.audit.record({
            command: `${commandName}:component`,
            ...(guildId ? { guildId } : {}),
            userId: actorUserId ?? userId,
            timestamp: new Date().toISOString(),
            success: false,
            durationMs: 0,
            errorCode: safe.code,
          });
        },
      };

      if (isMessageInteraction(interaction))
        await this.messageCommands
          .get(commandName)!
          .execute(interaction, context);
      else if (isUserInteraction(interaction))
        await this.userCommands.get(commandName)!.execute(interaction, context);
      else await this.get(commandName)!.execute(interaction, context);
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
