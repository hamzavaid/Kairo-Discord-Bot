import type { MusicService } from '../../services/MusicService.js';
import type { CommandDefinition } from '../types.js';
import { controlVoice } from '../guards.js';

export function createResumeCommand(music: MusicService): CommandDefinition {
  return {
    name: 'resume',
    description: 'Resume playback',
    usage: '/resume',
    category: 'Music',
    async execute(context) {
      await music.resume(controlVoice(context, music));
      return { content: 'Playback resumed.' };
    },
  };
}
