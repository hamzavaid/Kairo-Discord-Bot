import { SlashCommandBuilder } from 'discord.js';
import { controlVoice } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the queue'),
  usage: '/stop',
  category: 'Music',
  async execute(interaction, context) {
    await context.music.stop(controlVoice(interaction, context.music));
    await interaction.reply({ content: 'Playback stopped.' });
  },
};

export default command;
