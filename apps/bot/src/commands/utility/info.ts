import { SlashCommandBuilder } from 'discord.js';
import { guild, query } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { showTrackResults } from './TrackResultMenu.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show song metadata without playing')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Song name or supported track URL')
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('searchs')
        .setDescription('Number of results (info: 1, search: 5 by default)')
        .setMinValue(1)
        .setMaxValue(25),
    ),
  nicknames: ['search'],
  usage: '/info <query> [searchs]',
  category: 'Utility',
  async execute(interaction, context) {
    await interaction.deferReply();
    const count =
      interaction.options.getInteger('searchs') ??
      (interaction.commandName === 'search' ? 5 : 1);
    const input = query(interaction);
    const guildId = guild(interaction);
    const tracks =
      count === 1
        ? [await context.music.info(input, guildId, interaction.user.id)]
        : await context.music.infoResults(
            input,
            guildId,
            interaction.user.id,
            count,
          );
    await showTrackResults(interaction, context, tracks);
  },
};
export default command;
