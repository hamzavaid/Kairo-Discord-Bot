import { SlashCommandBuilder } from 'discord.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Leave voice and clear playback'),
  usage: '/disconnect',
  category: 'Music',
  async execute(interaction, context) {
    await context.music.disconnect(guild(interaction));
    await interaction.reply({ content: 'Disconnected from voice.' });
  },
};

export default command;
