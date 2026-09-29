import type { GuildSettingsRepository } from '@kairo/data';
import { CommandError } from '../../errors.js';
import type { CommandDefinition } from '../types.js';
import { guild } from '../guards.js';

export function createSettingsCommand(
  settings?: GuildSettingsRepository,
  onSettingsChanged?: (guildId: string) => Promise<void>,
): CommandDefinition {
  return {
    name: 'settings',
    description: 'Show or change this server’s empty-channel timeout',
    usage: '/settings [timeout_seconds] [audio_quality]',
    category: 'Utility',
    timeoutOption: true,
    audioQualityOption: true,
    async execute(context) {
      const guildId = guild(context);
      if (!settings) throw new Error('Guild settings repository unavailable.');
      if (
        context.timeoutSeconds !== undefined ||
        context.audioQuality !== undefined
      ) {
        if (!context.canManageGuild && !context.isDeveloper)
          throw new CommandError(
            'UNAUTHORIZED',
            'Manage Server permission is required to change settings.',
          );
        if (context.timeoutSeconds !== undefined)
          await settings.setIdleDisconnectSeconds(
            guildId,
            context.timeoutSeconds,
          );
        if (context.audioQuality !== undefined)
          await settings.setAudioQuality(guildId, context.audioQuality);
        await onSettingsChanged?.(guildId);
      }
      const current = await settings.get(guildId);
      return {
        content:
          `Audio quality: ${current.audioQuality}.\n` +
          (current.idleDisconnectSeconds === 0
            ? 'Empty-channel auto-disconnect: disabled.'
            : `Empty-channel auto-disconnect: ${current.idleDisconnectSeconds} seconds.`),
        ephemeral: true,
      };
    },
  };
}
