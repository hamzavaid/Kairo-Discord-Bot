import type { MusicService } from '../../services/MusicService.js';
import type { CommandDefinition } from '../types.js';
import { controlVoice } from '../guards.js';

export function createPauseCommand(music: MusicService): CommandDefinition {
  return {
    name: 'pause',
    description: 'Pause playback',
    usage: '/pause',
    category: 'Music',
    async execute(context) {
      await music.pause(controlVoice(context, music));
      return { content: 'Playback paused.' };
    },
  };
}
