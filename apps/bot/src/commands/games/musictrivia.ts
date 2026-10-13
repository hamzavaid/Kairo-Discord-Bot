import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { createGame } from './helpers.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('musictrivia')
    .setDescription('Guess songs or artists from bounded audio previews')
    .addIntegerOption((o) =>
      o
        .setName('rounds')
        .setDescription('Number of rounds')
        .setMinValue(1)
        .setMaxValue(20),
    )
    .addStringOption((o) =>
      o
        .setName('answer')
        .setDescription('Answer mode')
        .addChoices(
          ...['song', 'artist', 'both'].map((value) => ({
            name: value,
            value,
          })),
        ),
    )
    .addStringOption((o) =>
      o
        .setName('source')
        .setDescription('Music source')
        .addChoices(
          ...['catalog', 'liked', 'playlist', 'public'].map((value) => ({
            name: value,
            value,
          })),
        ),
    )
    .addStringOption((o) =>
      o
        .setName('playlist')
        .setDescription('Your private Kairo playlist name')
        .setMaxLength(64),
    )
    .addStringOption((o) =>
      o
        .setName('url')
        .setDescription('Public YouTube or Spotify collection URL')
        .setMaxLength(500),
    )
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Optional catalog or genre seed')
        .setMaxLength(500),
    )
    .addStringOption((o) =>
      o
        .setName('difficulty')
        .setDescription('Controls answer-window length')
        .addChoices(
          ...['easy', 'normal', 'hard'].map((value) => ({
            name: value,
            value,
          })),
        ),
    ),
  category: 'Games',
  usage: '/musictrivia [rounds] [answer] [source] [query]',
  execute: (i, c) => createGame(i, c, 'musictrivia'),
};
export default command;
