import type { ChatInputCommandInteraction } from 'discord.js';
import { CommandError } from '../errors.js';
import type { MusicService } from '../services/MusicService.js';

export function guild(interaction: ChatInputCommandInteraction): string {
  if (!interaction.guildId)
    throw new CommandError('GUILD_ONLY', 'Use this command in a server.');
  return interaction.guildId;
}

export function query(interaction: ChatInputCommandInteraction): string {
  const value = interaction.options.getString('query')?.trim();
  if (!value) throw new CommandError('MISSING_QUERY', 'Enter a song query.');
  return value;
}

export function userVoiceChannel(
  interaction: ChatInputCommandInteraction,
): string | undefined {
  return (
    interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId ??
    undefined
  );
}

export function controlVoice(
  interaction: ChatInputCommandInteraction,
  music: MusicService,
): string {
  const guildId = guild(interaction);
  const voiceChannelId = userVoiceChannel(interaction);
  if (!voiceChannelId)
    throw new CommandError('USER_NOT_IN_VOICE', 'Join a voice channel first.');
  music.assertVoiceChannel(guildId, voiceChannelId);
  return guildId;
}
