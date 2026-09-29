import type { MusicService } from '../../services/MusicService.js';
import type { CommandDefinition } from '../types.js';
import { controlVoice } from '../guards.js';

export function createStopCommand(music: MusicService): CommandDefinition {
  return {
    name: 'stop',
    description: 'Stop playback and clear the queue',
    usage: '/stop',
    category: 'Music',
    async execute(context) {
      await music.stop(controlVoice(context, music));
      return { content: 'Playback stopped.' };
    },
  };
}
