import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { controlVoice, guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Show or change the current session volume')
    .addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription('Volume from 0 to 100')
        .setMinValue(0)
        .setMaxValue(100),
    ),
  category: 'Music',
  usage: '/volume [amount]',
  async execute(i, c) {
    const amount = i.options.getInteger('amount');
    const id = guild(i);
    if (amount !== null) {
      controlVoice(i, c.music);
      if (c.controls) await c.controls.perform('volume', i, undefined, amount);
      else await c.music.setVolume(id, amount);
    }
    await i.reply({
      content: `Volume: ${amount ?? c.music.playback(id).volume ?? 100}%. Use /settings default_volume to change future sessions.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
export default command;
