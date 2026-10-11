import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { normalizeGuildControls } from '@kairo/data';
import { guild } from '../guards.js';
import { CommandError } from '../../errors.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Cast a listener vote to skip the current song'),
  category: 'Music',
  usage: '/vote',
  async execute(i, c) {
    const id = guild(i);
    if (!c.controls)
      throw new CommandError(
        'VOTE_NOT_REQUIRED',
        'Voting is unavailable. Use /skip.',
      );
    if (
      normalizeGuildControls((await c.settings.get(id)).controls)
        .controlPolicy !== 'vote'
    )
      throw new CommandError(
        'VOTE_NOT_REQUIRED',
        'This server does not require skip votes. Use /skip.',
      );
    const content = await c.controls.perform('skip', i);
    await i.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
export default command;
