import { SlashCommandBuilder } from 'discord.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue'),
  usage: '/queue',
  category: 'Music',
  async execute(interaction, context) {
    const snapshot = context.music.queue(guild(interaction));
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

    await interaction.reply({ content: lines.join('\n').slice(0, 1900) });
  },
};

export default command;
