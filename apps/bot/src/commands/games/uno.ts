import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { createGame } from './helpers.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('uno')
    .setDescription('Open a UNO lobby with private hands')
    .addBooleanOption((o) =>
      o.setName('stack_draw_two').setDescription('Allow draw-two stacking'),
    )
    .addBooleanOption((o) =>
      o
        .setName('draw_until_playable')
        .setDescription('Draw until a playable card is found'),
    ),
  category: 'Games',
  usage: '/uno [stack_draw_two] [draw_until_playable]',
  execute: (i, c) => createGame(i, c, 'uno'),
};
export default command;
