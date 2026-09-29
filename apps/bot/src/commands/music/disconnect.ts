import type { MusicService } from '../../services/MusicService.js';
import type { CommandDefinition } from '../types.js';
import { guild } from '../guards.js';

export function createDisconnectCommand(
  music: MusicService,
): CommandDefinition {
  return {
    name: 'disconnect',
    description: 'Leave voice and clear playback',
    usage: '/disconnect',
    category: 'Music',
    async execute(context) {
      await music.disconnect(guild(context));
      return { content: 'Disconnected from voice.' };
    },
  };
}
