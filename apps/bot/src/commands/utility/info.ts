import { SlashCommandBuilder } from 'discord.js';
import { guild, query } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { infoText } from './formatTrack.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show song metadata without playing')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Song name or supported track URL')
        .setRequired(true),
    ),
  usage: '/info <query>',
  category: 'Utility',
  async execute(interaction, context) {
    await interaction.deferReply();
    const track = await context.music.info(
      query(interaction),
      guild(interaction),
      interaction.user.id,
    );
    await interaction.editReply({ content: infoText(track) });
  },
};

export default command;
