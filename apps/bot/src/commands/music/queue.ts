import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { CommandError } from '../../errors.js';
import { pages } from '../library/components.js';
import { uiText, duration } from '../utility/formatTrack.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Inspect and manage the current queue')
    .addSubcommand((o) =>
      o
        .setName('list')
        .setDescription('Show the queue')
        .addIntegerOption((o) =>
          o.setName('page').setDescription('Page').setMinValue(1),
        ),
    )
    .addSubcommand((o) =>
      o
        .setName('search')
        .setDescription('Search title, artist or album')
        .addStringOption((o) =>
          o
            .setName('query')
            .setDescription('Queue search')
            .setRequired(true)
            .setMaxLength(500),
        ),
    )
    .addSubcommand((o) =>
      o
        .setName('remove')
        .setDescription('Remove an upcoming entry')
        .addIntegerOption((o) =>
          o
            .setName('position')
            .setDescription('Upcoming position')
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((o) =>
      o
        .setName('move')
        .setDescription('Move an upcoming entry')
        .addIntegerOption((o) =>
          o
            .setName('from')
            .setDescription('Current upcoming position')
            .setRequired(true)
            .setMinValue(1),
        )
        .addIntegerOption((o) =>
          o
            .setName('to')
            .setDescription('Destination position')
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((o) =>
      o
        .setName('clear')
        .setDescription(
          'Clear upcoming songs while preserving current playback',
        ),
    ),

  usage: '/queue <list|search|remove|move|clear>',
  category: 'Music',
  async execute(interaction, context) {
    const action = interaction.options?.getSubcommand?.(false);
    if (action) {
      const id = guild(interaction);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (action === 'list' || action === 'search') {
        const queue = context.music.queue(id);
        const entries =
          action === 'search'
            ? context.music.searchQueue(
                id,
                interaction.options.getString('query', true),
              )
            : queue.upcoming;
        const lines = entries.map(
          (entry) =>
            `${queue.current?.id === entry.id ? 'Now' : queue.upcoming.findIndex((e) => e.id === entry.id) + 1}. ${uiText(entry.track.title, 80)} - ${uiText(entry.track.artists.map((a) => a.name).join(', '), 40)} | ${duration(entry.track.durationMs)}`,
        );
        if (!lines.length) {
          await interaction.editReply({
            content:
              action === 'search'
                ? 'No queued songs match that search.'
                : queue.current
                  ? `Now: ${uiText(queue.current.track.title, 100)}. No upcoming songs.`
                  : 'The queue is empty.',
          });
          return;
        }
        await pages(
          interaction,
          context,
          action === 'search'
            ? '## Queue search'
            : `## Up next${queue.current ? ` - Now: ${uiText(queue.current.track.title, 80)}` : ''}`,
          lines,
          interaction.options.getInteger('page') ?? 1,
        );
        return;
      }
      if (!context.queueControls)
        throw new CommandError(
          'DJ_PERMISSION_REQUIRED',
          'Queue controls are unavailable.',
        );
      if (action === 'remove')
        await context.queueControls.remove(
          interaction,
          interaction.options.getInteger('position', true),
        );
      else if (action === 'move')
        await context.queueControls.move(
          interaction,
          interaction.options.getInteger('from', true),
          interaction.options.getInteger('to', true),
        );
      else if (action === 'clear')
        await context.queueControls.clear(interaction);
      await interaction.editReply({
        content:
          action === 'clear'
            ? 'Cleared upcoming songs; current playback continues.'
            : `Queue ${action} applied.`,
      });
      return;
    }
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
