import { SlashCommandBuilder } from 'discord.js';
import { controlVoice } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the upcoming queue'),
  usage: '/shuffle',
  category: 'Music',
  async execute(interaction, context) {
    const queue = await context.music.shuffle(
      controlVoice(interaction, context.music),
    );
    await interaction.reply({
      content:
        queue.upcoming.length < 2
          ? 'Add at least two upcoming songs to shuffle.'
          : `Shuffled ${queue.upcoming.length} upcoming songs.`,
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
