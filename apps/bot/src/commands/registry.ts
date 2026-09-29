import { SlashCommandBuilder } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { MusicService } from '../services/MusicService.js';
import type { CommandDefinition } from './types.js';
import { AuditLog } from './AuditLog.js';
import type { GuildSettingsRepository } from '@kairo/data';
import { createPlayCommand } from './music/play.js';
import { createPauseCommand } from './music/pause.js';
import { createResumeCommand } from './music/resume.js';
import { createSkipCommand } from './music/skip.js';
import { createStopCommand } from './music/stop.js';
import { createDisconnectCommand } from './music/disconnect.js';
import { createQueueCommand } from './music/queue.js';
import { createPingCommand } from './utility/ping.js';
import { createSettingsCommand } from './utility/settings.js';
import { createHelpCommand } from './utility/help.js';
import { createInfoCommand } from './utility/info.js';
import { createAuditlogCommand } from './developer/auditlog.js';

export class ApplicationCommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  add(command: CommandDefinition): void {
    if (this.commands.has(command.name))
      throw new Error(`Duplicate command: ${command.name}`);
    this.commands.set(command.name, command);
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  names(): string[] {
    return [...this.commands.keys()];
  }

  list(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  registrationData(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
    return this.list().map((command) => {
      const builder = new SlashCommandBuilder()
        .setName(command.name)
        .setDescription(command.description);
      if (command.queryOption)
        builder.addStringOption((option) =>
          option
            .setName('query')
            .setDescription('Song name or supported track URL')
            .setRequired(true),
        );
      if (command.pageOption)
        builder.addIntegerOption((option) =>
          option
            .setName('page')
            .setDescription('Audit page number')
            .setMinValue(1),
        );
      if (command.timeoutOption)
        builder.addIntegerOption((option) =>
          option
            .setName('timeout_seconds')
            .setDescription(
              'Seconds before leaving an empty voice channel; 0 disables (maximum 3600)',
            )
            .setMinValue(0)
            .setMaxValue(3600),
        );
      if (command.audioQualityOption)
        builder.addStringOption((option) =>
          option
            .setName('audio_quality')
            .setDescription('Playback audio quality')
            .addChoices(
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'High', value: 'high' },
              { name: 'Best', value: 'best' },
            ),
        );
      return builder.toJSON();
    });
  }
}

export function createCommandRegistry(
  music: MusicService,
  audit: AuditLog,
  settings?: GuildSettingsRepository,
  onSettingsChanged?: (guildId: string) => Promise<void>,
  onVoiceActivity?: (guildId: string) => Promise<void>,
): ApplicationCommandRegistry {
  const registry = new ApplicationCommandRegistry();
  for (const command of [
    createPlayCommand(music, onVoiceActivity),
    createPauseCommand(music),
    createResumeCommand(music),
    createSkipCommand(music),
    createStopCommand(music),
    createDisconnectCommand(music),
    createQueueCommand(music),
    createPingCommand(),
    createSettingsCommand(settings, onSettingsChanged),
    createHelpCommand(registry),
    createInfoCommand(music),
    createAuditlogCommand(audit),
  ])
    registry.add(command);
  return registry;
}
