import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { PlayerMenu } from './player/PlayerMenu.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Open the playback manager and queue')
    .addBooleanOption((o) =>
      o
        .setName('shared')
        .setDescription(
          'Allow authorized listeners to use this player (default: shared)',
        ),
    ),
  usage: '/player',
  category: 'Music',
  async execute(interaction, context) {
    guild(interaction);
    const shared =
      interaction.options?.getBoolean?.('shared') ?? Boolean(context.controls);
    await interaction.deferReply(
      shared ? {} : { flags: MessageFlags.Ephemeral },
    );
    await new PlayerMenu(interaction, context, shared).start();
  },
};
export default command;
