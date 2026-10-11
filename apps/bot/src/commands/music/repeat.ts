import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { RepeatMode } from '@kairo/music-engine';
import { controlVoice, guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('repeat')
    .setDescription('Show or change repeat mode')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Repeat mode')
        .addChoices(
          ...['off', 'track', 'queue'].map((value) => ({ name: value, value })),
        ),
    ),
  category: 'Music',
  usage: '/repeat [mode]',
  async execute(i, c) {
    const mode = i.options.getString('mode') as RepeatMode | null;
    const id = guild(i);
    if (mode) {
      controlVoice(i, c.music);
      if (c.controls) await c.controls.perform('repeat', i, undefined, mode);
      else await c.music.setRepeat(id, mode);
    }
    await i.reply({
      content: `Repeat: ${mode ?? c.music.queue(id).repeatMode}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
export default command;
