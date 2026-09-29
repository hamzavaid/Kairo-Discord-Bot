import type { MusicService } from '../../services/MusicService.js';
import { CommandError } from '../../errors.js';
import type { CommandDefinition } from '../types.js';
import { guild, query } from '../guards.js';

export function createPlayCommand(
  music: MusicService,
  onVoiceActivity?: (guildId: string) => Promise<void>,
): CommandDefinition {
  return {
    name: 'play',
    description: 'Play or queue a song',
    usage: '/play <query>',
    category: 'Music',
    queryOption: true,
    defer: true,
    async execute(context) {
      const guildId = guild(context);
      if (!context.voiceChannelId || !context.voiceTarget)
        throw new CommandError(
          'USER_NOT_IN_VOICE',
          'Join a voice channel first.',
        );
      const result = await music.play({
        guildId,
        userId: context.userId,
        query: query(context),
        voiceTarget: context.voiceTarget,
      });
      await onVoiceActivity?.(guildId);
      return {
        content:
          result.position === 0
            ? `Playing: ${result.track.title}`
            : `Queued #${result.position}: ${result.track.title}`,
      };
    },
  };
}
