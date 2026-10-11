import { SlashCommandBuilder } from 'discord.js';
import { controlVoice } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume playback'),
  usage: '/resume',
  category: 'Music',
  async execute(interaction, context) {
    if (context.controls) {
      const content = await context.controls.perform('resume', interaction);
      await interaction.reply({ content });
      return;
    }
    await context.music.resume(controlVoice(interaction, context.music));
    await interaction.reply({ content: 'Playback resumed.' });
  },
};

export default command;
