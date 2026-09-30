import { SlashCommandBuilder } from 'discord.js';
import { controlVoice } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause playback'),
  usage: '/pause',
  category: 'Music',
  async execute(interaction, context) {
    await context.music.pause(controlVoice(interaction, context.music));
    await interaction.reply({ content: 'Playback paused.' });
  },
};

export default command;
