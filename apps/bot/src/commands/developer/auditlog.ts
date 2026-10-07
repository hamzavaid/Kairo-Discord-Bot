import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('auditlog')
    .setDescription('Show recent Kairo commands')
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Audit page number').setMinValue(1),
    ),
  usage: '/auditlog [page]',
  nicknames: ['log'],
  category: 'Developer',
  developerOnly: true,
  async execute(interaction, context) {
    const records = context.audit.list(
      interaction.options.getInteger('page') ?? 1,
      10,
    );

    await interaction.reply({
      content: records.length
        ? records
            .map(
              (entry) =>
                `${entry.timestamp} /${entry.command} user=${entry.userId} guild=${entry.guildId ?? 'DM'} ${entry.success ? 'ok' : `failed:${entry.errorCode ?? 'INTERNAL_ERROR'}`} ${entry.durationMs}ms`,
            )
            .join('\n')
            .slice(0, 1900)
        : 'No command records on this page.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
