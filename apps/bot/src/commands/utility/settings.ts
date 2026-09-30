import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { AudioQuality } from '@kairo/data';
import { CommandError } from '../../errors.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Show or change this server’s empty-channel timeout')
    .addIntegerOption((option) =>
      option
        .setName('timeout_seconds')
        .setDescription(
          'Seconds before leaving an empty voice channel; 0 disables (maximum 3600)',
        )
        .setMinValue(0)
        .setMaxValue(3600),
    )
    .addStringOption((option) =>
      option
        .setName('audio_quality')
        .setDescription('Playback audio quality')
        .addChoices(
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
          { name: 'High', value: 'high' },
          { name: 'Best', value: 'best' },
        ),
    ),
  usage: '/settings [timeout_seconds] [audio_quality]',
  category: 'Utility',
  async execute(interaction, context) {
    const guildId = guild(interaction);
    const timeoutSeconds = interaction.options.getInteger('timeout_seconds');
    const audioQuality = interaction.options.getString(
      'audio_quality',
    ) as AudioQuality | null;

    if (timeoutSeconds !== null || audioQuality !== null) {
      const canManageGuild =
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
        false;

      if (!canManageGuild && !context.isDeveloper)
        throw new CommandError(
          'UNAUTHORIZED',
          'Manage Server permission is required to change settings.',
        );

      if (timeoutSeconds !== null)
        await context.settings.setIdleDisconnectSeconds(
          guildId,
          timeoutSeconds,
        );
      if (audioQuality !== null)
        await context.settings.setAudioQuality(guildId, audioQuality);
      await context.onSettingsChanged?.(guildId);
    }

    const current = await context.settings.get(guildId);
    await interaction.reply({
      content:
        `Audio quality: ${current.audioQuality}.\n` +
        (current.idleDisconnectSeconds === 0
          ? 'Empty-channel auto-disconnect: disabled.'
          : `Empty-channel auto-disconnect: ${current.idleDisconnectSeconds} seconds.`),
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
