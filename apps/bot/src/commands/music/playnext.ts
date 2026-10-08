import { SlashCommandBuilder } from 'discord.js';
import { display, voiceTarget } from '../library/helpers.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('playnext')
    .setDescription('Put a song first in the upcoming queue')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Song name or supported track URL')
        .setRequired(true),
    ),
  usage: '/playnext <query>',
  category: 'Music',
  async execute(interaction, context) {
    await interaction.deferReply();
    const target = voiceTarget(interaction, context);
    const result = await context.music.playNext({
      guildId: target.guildId,
      userId: interaction.user.id,
      query: interaction.options.getString('query', true),
      voiceTarget: target,
    });
    context.onVoiceActivity?.(target.guildId);
    await interaction.editReply({
      content: `${result.position === 0 ? 'Playing' : 'Queued next'}: ${display(result.track.title, 150)}`,
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
