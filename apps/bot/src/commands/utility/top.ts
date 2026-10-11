import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { showStatistics } from './statisticsView.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Show most listened songs or artists')
    .addSubcommand((o) =>
      o
        .setName('songs')
        .setDescription('Top songs')
        .addStringOption((o) =>
          o
            .setName('scope')
            .setDescription('Scope')
            .addChoices(
              { name: 'User', value: 'user' },
              { name: 'Server', value: 'server' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('period')
            .setDescription('Period')
            .addChoices(
              ...['week', 'month', 'all'].map((value) => ({
                name: value,
                value,
              })),
            ),
        ),
    )
    .addSubcommand((o) =>
      o
        .setName('artists')
        .setDescription('Top artists')
        .addStringOption((o) =>
          o
            .setName('scope')
            .setDescription('Scope')
            .addChoices(
              { name: 'User', value: 'user' },
              { name: 'Server', value: 'server' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('period')
            .setDescription('Period')
            .addChoices(
              ...['week', 'month', 'all'].map((value) => ({
                name: value,
                value,
              })),
            ),
        ),
    ),
  category: 'Utility',
  usage: '/top <songs|artists> [scope] [period]',
  execute: (i, c) =>
    showStatistics(i, c, i.options.getSubcommand() as 'songs' | 'artists'),
};
export default command;
