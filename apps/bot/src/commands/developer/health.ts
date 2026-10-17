import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { CommandError } from '../../errors.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('Inspect Kairo readiness and resource health'),
  category: 'Developer',
  usage: '/health',
  developerOnly: true,
  async execute(i, c) {
    if (!c.diagnostics)
      throw new CommandError(
        'DIAGNOSTICS_UNAVAILABLE',
        'Diagnostics are unavailable.',
      );
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const health = await c.diagnostics.health();
    await i.editReply({
      content: `Kairo: ${health.status}\nReady: ${health.ready}\nMongoDB: ${health.database}\n${Object.entries(
        health.resources,
      )
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')}`,
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
