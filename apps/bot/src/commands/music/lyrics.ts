import { SlashCommandBuilder, MessageFlags, escapeMarkdown } from 'discord.js';
import { CommandError } from '../../errors.js';
import { guild } from '../guards.js';
import { pages } from '../library/components.js';
import { uiText } from '../utility/formatTrack.js';
import type { SlashCommand, CommandExecutionContext } from '../types.js';
import type { Track } from '@kairo/music-engine';
export function lyricsChunks(text: string): string[] {
  const safe = escapeMarkdown(
    text.replace(/[\p{Cc}]/gu, (c) => (c === '\n' ? c : '')),
  );
  const chunks: string[] = [];
  for (let i = 0; i < safe.length; i += 1500)
    chunks.push(safe.slice(i, i + 1500));
  return chunks;
}
export async function resolveLyrics(
  context: CommandExecutionContext,
  track: Track,
) {
  if (!context.lyrics)
    throw new CommandError(
      'LYRICS_PROVIDER_UNAVAILABLE',
      'Lyrics are unavailable.',
    );
  return context.lyrics.get(track);
}
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Show lyrics for a song or the current track')
    .addStringOption((o) =>
      o.setName('query').setDescription('Optional song name or URL'),
    ),
  category: 'Music',
  usage: '/lyrics [query]',
  async execute(i, c) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const id = guild(i);
    const query = i.options.getString('query');
    const track = query
      ? await c.music.info(query, id, i.user.id)
      : c.music.currentTrack(id);
    const result = await resolveLyrics(c, track);
    if (result.kind !== 'lyrics') {
      await i.editReply({
        content:
          result.kind === 'instrumental'
            ? 'This track is instrumental. No lyrics are available.'
            : 'No lyrics were found for this song.',
      });
      return;
    }
    await pages(
      i,
      c,
      `## ${uiText(track.title, 80)} - Lyrics (${uiText(result.provider, 30)})`,
      lyricsChunks(result.text),
      1,
      1,
    );
  },
};
export default command;
