import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { CommandError } from '../../errors.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('providerstatus')
    .setDescription('Inspect metadata provider circuits'),
  category: 'Developer',
  usage: '/providerstatus',
  developerOnly: true,
  async execute(i, c) {
    if (!c.diagnostics)
      throw new CommandError(
        'DIAGNOSTICS_UNAVAILABLE',
        'Diagnostics are unavailable.',
      );
    await i.reply({
      content:
        c.diagnostics
          .providers()
          .map(
            (p) =>
              `${p.id}: ${p.circuit} | failures ${p.failures}${p.lastError ? ` | ${p.lastError}` : ''}`,
          )
          .join('\n') || 'No providers registered.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
