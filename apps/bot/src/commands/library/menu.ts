import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { LibraryMenu } from './menu/LibraryMenu.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Open the prototype library menu'),
  usage: '/menu',
  category: 'Library',
  async execute(interaction, context) {
    guild(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await new LibraryMenu(interaction, context).start();
  },
};
export default command;
