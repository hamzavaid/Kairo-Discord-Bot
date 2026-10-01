import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { library } from './helpers.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('dislike')
    .setDescription('Remove a song from your Liked Songs')
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Song query; omit for the current track'),
    ),
  usage: '/dislike [query]',
  category: 'Library',
  async execute(interaction, context) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removed = await library(context).dislike(
      interaction.user.id,
      guild(interaction),
      interaction.options.getString('query') ?? undefined,
    );
    await interaction.editReply({
      content: removed
        ? 'Removed from Liked Songs.'
        : 'That song is not in your Liked Songs.',
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
