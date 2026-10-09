import { SlashCommandBuilder } from 'discord.js';
import { CommandError } from '../../errors.js';
import { guild, query, userVoiceChannel } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { playResponse } from './playResponse.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play or queue a song or supported playlist')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Song name, track URL or supported playlist/album URL')
        .setRequired(true),
    ),
  usage: '/play <query>',
  nicknames: ['p'],
  category: 'Music',
  async execute(interaction, context) {
    await interaction.deferReply();

    const guildId = guild(interaction);
    const voiceChannelId = userVoiceChannel(interaction);
    if (!voiceChannelId || !interaction.guild)
      throw new CommandError(
        'USER_NOT_IN_VOICE',
        'Join a voice channel first.',
      );

    const result = await context.music.play({
      guildId,
      userId: interaction.user.id,
      query: query(interaction),
      voiceTarget: {
        guildId,
        channelId: voiceChannelId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      },
    });

    await context.onVoiceActivity?.(guildId);
    await interaction.editReply({
      content: playResponse(result),
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
