import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { display, library } from './helpers.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('like')
    .setDescription('Save a song to your Liked Songs')
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Song query; omit for the current track'),
    ),
  usage: '/like [query]',
  category: 'Library',
  async execute(interaction, context) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await library(context).like(
      interaction.user.id,
      guild(interaction),
      interaction.options.getString('query') ?? undefined,
    );
    await interaction.editReply({
      content: result.added
        ? `Liked: ${display(result.track.title)}`
        : `You already liked ${display(result.track.title)}.`,
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
