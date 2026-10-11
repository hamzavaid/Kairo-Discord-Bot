import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  DISCOVERY_SECTIONS,
  type DiscoverySection,
} from '../../services/DiscoveryService.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { DiscoveryMenu } from './discovery/DiscoveryMenu.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('discover')
    .setDescription(
      'Explore recommendations, likes, recent songs and music search',
    )
    .addStringOption((o) =>
      o
        .setName('section')
        .setDescription('Starting section')
        .addChoices(
          ...DISCOVERY_SECTIONS.map((value) => ({ name: value, value })),
        ),
    )
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Optional artist or search query')
        .setMaxLength(500),
    ),
  category: 'Utility',
  usage: '/discover [section] [query]',
  async execute(i, c) {
    guild(i);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await new DiscoveryMenu(
      i,
      c,
      (i.options.getString('section') ?? 'recommended') as DiscoverySection,
      i.options.getString('query') ?? undefined,
    ).start();
  },
};
export default command;
