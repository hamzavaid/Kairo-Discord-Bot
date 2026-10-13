import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { parseSeekTimestamp } from '@kairo/music-engine';
import { controlVoice } from '../guards.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek within supported non-live audio')
    .addStringOption((o) =>
      o
        .setName('timestamp')
        .setDescription('Seconds, m:ss or h:mm:ss')
        .setRequired(true)
        .setMaxLength(32),
    ),
  category: 'Music',
  usage: '/seek <timestamp>',
  async execute(i, c) {
    const position = parseSeekTimestamp(i.options.getString('timestamp', true));
    const id = controlVoice(i, c.music);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    if (c.controls) await c.controls.perform('seek', i, undefined, position);
    else await c.music.seek(id, position);
    await i.editReply({
      content: `Seeked to ${Math.floor(position / 60000)}:${String(Math.floor(position / 1000) % 60).padStart(2, '0')}.`,
    });
  },
};
export default command;
