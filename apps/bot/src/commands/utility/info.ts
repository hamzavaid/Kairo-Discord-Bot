import type { MusicService } from '../../services/MusicService.js';
import type { CommandDefinition } from '../types.js';
import { guild, query } from '../guards.js';
import { infoText } from './formatTrack.js';

export function createInfoCommand(music: MusicService): CommandDefinition {
  return {
    name: 'info',
    description: 'Show song metadata without playing',
    usage: '/info <query>',
    category: 'Utility',
    queryOption: true,
    defer: true,
    async execute(context) {
      const track = await music.info(
        query(context),
        guild(context),
        context.userId,
      );
      return { content: infoText(track) };
    },
  };
}
