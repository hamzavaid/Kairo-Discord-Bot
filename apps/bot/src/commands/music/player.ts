import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { PlayerMenu } from './player/PlayerMenu.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Open the playback manager and queue'),
  usage: '/player',
  category: 'Music',
  async execute(interaction, context) {
    guild(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await new PlayerMenu(interaction, context).start();
  },
};
export default command;
