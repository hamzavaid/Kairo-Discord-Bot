import { LibraryError, type LibraryCollection } from '@kairo/data';
import type { VoiceTarget } from '@kairo/music-engine';
import { CommandError } from '../../errors.js';
import { guild, userVoiceChannel, type GuildInteraction } from '../guards.js';
import type { CommandExecutionContext } from '../types.js';
export function library(context: CommandExecutionContext) {
  if (!context.library)
    throw new LibraryError(
      'LIBRARY_UNAVAILABLE',
      'The library is unavailable.',
    );
  return context.library;
}
export function voiceTarget(
  interaction: GuildInteraction,
  context: CommandExecutionContext,
): VoiceTarget {
  const guildId = guild(interaction);
  const channelId = userVoiceChannel(interaction);
  if (!channelId || !interaction.guild)
    throw new CommandError('USER_NOT_IN_VOICE', 'Join a voice channel first.');
  context.music.assertVoiceChannel(guildId, channelId);
  return {
    guildId,
    channelId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
  };
}
export const display = (value: string, maximum = 70) =>
  value.replace(/[\n\r`*_~|<>]/gu, ' ').slice(0, maximum);
export function trackLines(collection: LibraryCollection): string[] {
  return collection.entries.map(
    (entry, index) =>
      `${index + 1}. ${display(entry.track.title)} — ${display(entry.track.artists.map((a) => a.name).join(', '), 50)}`,
  );
}
