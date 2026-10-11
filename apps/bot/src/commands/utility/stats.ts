import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { showStatistics } from './statisticsView.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show personal or server listening statistics')
    .addStringOption((o) =>
      o
        .setName('scope')
        .setDescription('Statistics scope')
        .addChoices(
          { name: 'User', value: 'user' },
          { name: 'Server', value: 'server' },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('period')
        .setDescription('Time window')
        .addChoices(
          ...['week', 'month', 'all'].map((value) => ({ name: value, value })),
        ),
    ),
  category: 'Utility',
  usage: '/stats [scope] [period]',
  execute: (i, c) => showStatistics(i, c),
};
export default command;
