import {
  MessageFlags,
  type MessageContextMenuCommandInteraction,
} from 'discord.js';
import { CommandError } from '../../errors.js';
import { guild } from '../guards.js';
import { voiceTarget } from '../library/helpers.js';
import { showTrackResults } from '../utility/TrackResultMenu.js';
import { playResponse } from '../music/playResponse.js';
import type { CommandExecutionContext } from '../types.js';
export function messageQuery(content: string): string {
  const value = content.trim();
  const url = value.match(/https?:\/\/[^\s<>]+/u)?.[0];
  const query = (url ?? value).replace(/[),.!]+$/u, '');
  if (!query || query.length > 500)
    throw new CommandError(
      'MISSING_QUERY',
      'Choose a message with a song name or supported music URL (up to 500 characters).',
    );
  return query;
}
export async function executeMessage(
  i: MessageContextMenuCommandInteraction,
  c: CommandExecutionContext,
  action: 'play' | 'playnext' | 'search' | 'info',
) {
  const id = guild(i);
  const query = messageQuery(i.targetMessage.content);
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  if (action === 'info' || action === 'search') {
    const tracks =
      action === 'info'
        ? [await c.music.info(query, id, i.user.id)]
        : await c.music.infoResults(query, id, i.user.id, 10);
    await showTrackResults(i, c, tracks);
    return;
  }
  const target = voiceTarget(i, c);
  const request = {
    guildId: id,
    userId: i.user.id,
    voiceTarget: target,
    query,
  };
  const result =
    action === 'playnext'
      ? await c.music.playNext(request)
      : await c.music.play(request);
  await c.onVoiceActivity?.(id);
  await i.editReply({
    content: playResponse(result, action === 'playnext'),
    allowedMentions: { parse: [] },
  });
}
