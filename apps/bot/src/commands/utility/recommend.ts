import { SlashCommandBuilder } from 'discord.js';
import { guild } from '../guards.js';
import { CommandError } from '../../errors.js';
import { showTrackResults } from './TrackResultMenu.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('recommend')
    .setDescription('Browse fresh music suggestions')
    .addStringOption((o) =>
      o.setName('query').setDescription('Optional song or artist seed'),
    ),
  usage: '/recommend [query]',
  category: 'Utility',
  async execute(i, c) {
    if (!c.recommendations)
      throw new CommandError(
        'RECOMMENDATION_UNAVAILABLE',
        'Recommendations are unavailable.',
      );
    await i.deferReply();
    const query = i.options.getString('query');
    const tracks = await c.recommendations.recommend({
      guildId: guild(i),
      userId: i.user.id,
      ...(query ? { query } : {}),
    });
    await showTrackResults(i, c, tracks);
  },
};
export default command;
