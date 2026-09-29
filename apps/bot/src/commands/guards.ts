import type { MusicService } from '../services/MusicService.js';
import { CommandError } from '../errors.js';
import type { CommandContext } from './types.js';

export function guild(context: CommandContext): string {
  if (!context.guildId)
    throw new CommandError('GUILD_ONLY', 'Use this command in a server.');
  return context.guildId;
}

export function query(context: CommandContext): string {
  const value = context.query?.trim();
  if (!value) throw new CommandError('MISSING_QUERY', 'Enter a song query.');
  return value;
}

export function controlVoice(
  context: CommandContext,
  music: MusicService,
): string {
  const guildId = guild(context);
  if (!context.voiceChannelId)
    throw new CommandError('USER_NOT_IN_VOICE', 'Join a voice channel first.');
  music.assertVoiceChannel(guildId, context.voiceChannelId);
  return guildId;
}
