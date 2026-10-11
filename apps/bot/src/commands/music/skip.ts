import { SlashCommandBuilder } from 'discord.js';
import { controlVoice } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song'),
  usage: '/skip',
  nicknames: ['s', 'next'],
  category: 'Music',
  async execute(interaction, context) {
    if (context.controls) {
      const content = await context.controls.perform('skip', interaction);
      await interaction.reply({ content });
      return;
    }
    await context.music.skip(controlVoice(interaction, context.music));
    await interaction.reply({ content: 'Skipped.' });
  },
};

export default command;
