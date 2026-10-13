import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { createGame } from './helpers.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('hangman')
    .setDescription('Guess the hidden music word with friends'),
  category: 'Games',
  usage: '/hangman',
  execute: (i, c) => createGame(i, c, 'hangman'),
};
export default command;
