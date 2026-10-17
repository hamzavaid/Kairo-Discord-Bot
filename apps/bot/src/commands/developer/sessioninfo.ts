import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { CommandError } from '../../errors.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('sessioninfo')
    .setDescription('Inspect this guild playback state safely'),
  category: 'Developer',
  usage: '/sessioninfo',
  developerOnly: true,
  async execute(i, c) {
    if (!c.diagnostics)
      throw new CommandError(
        'DIAGNOSTICS_UNAVAILABLE',
        'Diagnostics are unavailable.',
      );
    await i.reply({
      content: Object.entries(c.diagnostics.session(guild(i)))
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n'),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
