import type { MusicService } from '../../services/MusicService.js';
import type { CommandDefinition } from '../types.js';
import { controlVoice } from '../guards.js';

export function createSkipCommand(music: MusicService): CommandDefinition {
  return {
    name: 'skip',
    description: 'Skip the current song',
    usage: '/skip',
    category: 'Music',
    async execute(context) {
      await music.skip(controlVoice(context, music));
      return { content: 'Skipped.' };
    },
  };
}
