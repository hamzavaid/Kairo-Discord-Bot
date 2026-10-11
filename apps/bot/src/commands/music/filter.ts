import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { FILTER_PRESETS } from '@kairo/data';
import { controlVoice, guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply a trusted preset to subsequent tracks')
    .addStringOption((o) =>
      o
        .setName('preset')
        .setDescription('Filter preset, reset or status')
        .setRequired(true)
        .addChoices(
          ...[...FILTER_PRESETS, 'reset', 'status'].map((value) => ({
            name: value,
            value,
          })),
        ),
    ),
  category: 'Music',
  usage: '/filter <preset|reset|status>',
  async execute(i, c) {
    const selected = i.options.getString('preset', true);
    const id = guild(i);
    const preset = selected === 'reset' ? 'flat' : selected;
    if (preset !== 'status') {
      controlVoice(i, c.music);
      await c.music.setFilter(id, preset as (typeof FILTER_PRESETS)[number]);
    }
    await i.reply({
      content: `Filter: ${preset === 'status' ? (c.music.playback(id).filter ?? 'flat') : preset}. Changes apply to subsequent tracks.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
export default command;
