import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { CommandError } from '../../errors.js';
import type { CommandExecutionContext } from '../types.js';
import type { StatisticsPeriod } from '../../services/StatisticsService.js';
import { uiText } from './formatTrack.js';
export async function showStatistics(
  i: ChatInputCommandInteraction,
  c: CommandExecutionContext,
  kind?: 'songs' | 'artists',
) {
  if (!c.statistics)
    throw new CommandError(
      'HISTORY_EMPTY',
      'Listening statistics are unavailable.',
    );
  const scope =
    i.options.getString('scope') === 'server'
      ? { guildId: i.guildId ?? '' }
      : { userId: i.user.id };
  if ('guildId' in scope && !scope.guildId)
    throw new CommandError('GUILD_ONLY', 'Use server statistics in a server.');
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const data = await c.statistics.get(
    scope,
    (i.options.getString('period') ?? 'all') as StatisticsPeriod,
  );
  const heading = `## ${kind ? `Top ${kind}` : 'Listening statistics'} (${data.period})`;
  const summary = `Completed: ${data.completed} | Requests: ${data.requests} | Listening: ${(data.listenedMs / 60000).toFixed(1)} min\nSkips: ${data.skips} | Failures: ${data.failures} | Active users: ${data.activeUsers}\nManual: ${data.manual} | Autoplay: ${data.autoplay}${'userId' in scope ? `\nPlaylists: ${data.playlists} | Liked songs: ${data.likedSongs}` : ''}`;
  const entries =
    kind === 'artists'
      ? data.artists.map((a) => `${uiText(a.name, 80)} - ${a.listens} listens`)
      : data.songs.map((s) => `${uiText(s.title, 80)} - ${s.listens} listens`);
  await i.editReply({
    content: [
      heading,
      ...(kind
        ? entries.slice(0, 10).map((text, n) => `${n + 1}. ${text}`)
        : [summary]),
      '-# All-time means retained history (180 days).',
      ...(data.truncated
        ? ['-# Showing the most recent 10,000 attempts.']
        : []),
    ].join('\n'),
    allowedMentions: { parse: [] },
  });
}
