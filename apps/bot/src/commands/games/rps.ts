import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { createGame } from './helpers.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Challenge a player to Rock Paper Scissors')
    .addUserOption((o) =>
      o.setName('opponent').setDescription('Optional invited opponent'),
    )
    .addIntegerOption((o) =>
      o
        .setName('best_of')
        .setDescription('Best-of series')
        .addChoices(
          ...[1, 3, 5, 7, 9].map((value) => ({ name: String(value), value })),
        ),
    ),
  category: 'Games',
  usage: '/rps [opponent] [best_of]',
  execute: (i, c) => createGame(i, c, 'rps'),
};
export default command;
