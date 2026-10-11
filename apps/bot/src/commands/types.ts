import type { QueueControlService } from '../services/QueueControlService.js';
import type { PlaybackControlService } from '../services/PlaybackControlService.js';
import type { LyricsService } from '../services/LyricsService.js';
import type { RecommendationService } from '../services/RecommendationService.js';
import type { HistoryService } from '../services/HistoryService.js';
import type { StatisticsService } from '../services/StatisticsService.js';
import type { PlaybackPolicyService } from '../services/PlaybackPolicyService.js';
import type { GuildSettingsRepository } from '@kairo/data';
import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { MusicService } from '../services/MusicService.js';
import type { LibraryService } from '../services/LibraryService.js';
import type { AuditLog } from './AuditLog.js';

export type CommandCategory = 'Music' | 'Library' | 'Utility' | 'Developer';

export interface CommandServices {
  music: MusicService;
  audit: AuditLog;
  settings: GuildSettingsRepository;
  library?: LibraryService;
  policy?: PlaybackPolicyService;
  controls?: PlaybackControlService;
  queueControls?: QueueControlService;
  history?: HistoryService;
  recommendations?: RecommendationService;
  lyrics?: LyricsService;
  statistics?: StatisticsService;
  onSettingsChanged?: (guildId: string) => Promise<void>;
  onVoiceActivity?: (guildId: string) => Promise<void>;
}

export interface CommandExecutionContext extends CommandServices {
  isDeveloper: boolean;
  commands: ReadonlyMap<string, SlashCommand>;
  reportComponentError?: (error: unknown, actorUserId?: string) => void;
  componentErrorMessage?: (error: unknown) => string;
}

export interface SlashCommandData {
  readonly name: string;
  readonly description: string;

  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface SlashCommand {
  data: SlashCommandData;
  nicknames?: readonly string[];
  usage: string;
  category: CommandCategory;
  developerOnly?: boolean;
  execute(
    interaction: ChatInputCommandInteraction,
    context: CommandExecutionContext,
  ): Promise<void>;
}

export interface MessageCommand {
  data: import('discord.js').ContextMenuCommandBuilder;
  category: CommandCategory;
  usage: string;
  admission: 'play' | 'playnext' | 'info';
  developerOnly?: boolean;
  execute(
    interaction: import('discord.js').MessageContextMenuCommandInteraction,
    context: CommandExecutionContext,
  ): Promise<void>;
}
