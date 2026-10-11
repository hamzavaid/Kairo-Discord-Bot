import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { normalizeGuildControls } from '@kairo/data';
import { CommandError } from '../../errors.js';
import { controlVoice, guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Enable radio after the manual queue ends')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Radio mode')
        .addChoices(
          ...['on', 'off', 'status'].map((value) => ({ name: value, value })),
        ),
    ),
  usage: '/autoplay [on|off|status]',
  category: 'Music',
  async execute(i, c) {
    const id = guild(i);
    const mode = i.options.getString('mode') ?? 'status';
    if (mode !== 'status') {
      controlVoice(i, c.music);
      if (!c.settings.setControls)
        throw new CommandError(
          'INVALID_SETTING',
          'Autoplay settings are unavailable.',
        );
      await c.settings.setControls(id, { autoplay: mode === 'on' });
      await c.onSettingsChanged?.(id);
    }
    const on = normalizeGuildControls(
      (await c.settings.get(id)).controls,
    ).autoplay;
    await i.reply({
      content: `Autoplay: ${on ? 'on' : 'off'}. Manual queued songs play first.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
export default command;
