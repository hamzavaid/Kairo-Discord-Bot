import type { MusicService } from '../../services/MusicService.js';
import type { CommandDefinition } from '../types.js';
import { guild } from '../guards.js';

export function createQueueCommand(music: MusicService): CommandDefinition {
  return {
    name: 'queue',
    description: 'Show the current queue',
    usage: '/queue',
    category: 'Music',
    async execute(context) {
      const snapshot = music.queue(guild(context));
      const lines = [
        snapshot.current
          ? `Now: ${snapshot.current.track.title}`
          : 'Nothing playing.',
        ...snapshot.upcoming
          .slice(0, 10)
          .map((entry, index) => `${index + 1}. ${entry.track.title}`),
      ];
      if (snapshot.upcoming.length > 10)
        lines.push(`…and ${snapshot.upcoming.length - 10} more`);
      return { content: lines.join('\n').slice(0, 1900) };
    },
  };
}
