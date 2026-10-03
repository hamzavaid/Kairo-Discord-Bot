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
  onSettingsChanged?: (guildId: string) => Promise<void>;
  onVoiceActivity?: (guildId: string) => Promise<void>;
}

export interface CommandExecutionContext extends CommandServices {
  isDeveloper: boolean;
  commands: ReadonlyMap<string, SlashCommand>;
  reportComponentError?: (error: unknown) => void;
  componentErrorMessage?: (error: unknown) => string;
}

export interface SlashCommandData {
  readonly name: string;
  readonly description: string;

  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface SlashCommand {
  data: SlashCommandData;
  usage: string;
  category: CommandCategory;
  developerOnly?: boolean;
  execute(
    interaction: ChatInputCommandInteraction,
    context: CommandExecutionContext,
  ): Promise<void>;
}
