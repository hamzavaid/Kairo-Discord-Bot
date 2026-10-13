import { GameError, type GameKind } from '@kairo/games';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { CommandExecutionContext } from '../types.js';
import { GameMenu } from './GameMenu.js';
export async function createGame(
  i: ChatInputCommandInteraction,
  c: CommandExecutionContext,
  kind: GameKind,
) {
  if (!i.guildId || !c.games)
    throw new GameError(
      'GAME_INVALID',
      'Games are unavailable outside a server.',
    );
  const target = kind === 'rps' ? i.options.getUser('opponent') : null;
  if (target && (target.bot || target.id === i.user.id))
    throw new GameError('GAME_INVALID', 'Invite another human player.');
  await i.deferReply();
  const game = await c.games.create({
    guildId: i.guildId,
    channelId: i.channelId,
    hostId: i.user.id,
    kind,
    ...(target ? { invitedUserId: target.id } : {}),
    ...(kind === 'rps' ? { bestOf: i.options.getInteger('best_of') ?? 3 } : {}),
    ...(kind === 'uno'
      ? {
          stackDrawTwo: i.options.getBoolean('stack_draw_two') ?? false,
          drawUntilPlayable:
            i.options.getBoolean('draw_until_playable') ?? false,
        }
      : {}),
    ...(kind === 'musictrivia'
      ? {
          ...(i.options.getInteger('rounds') !== null
            ? { rounds: i.options.getInteger('rounds')! }
            : {}),
          answerMode: (i.options.getString('answer') ?? 'song') as
            'song' | 'artist' | 'both',
          source: (i.options.getString('source') ?? 'catalog') as
            'catalog' | 'liked' | 'playlist' | 'public',
          difficulty: (i.options.getString('difficulty') ?? 'normal') as
            'easy' | 'normal' | 'hard',
          ...(i.options.getString('playlist')
            ? { playlist: i.options.getString('playlist')! }
            : {}),
          ...(i.options.getString('url')
            ? { url: i.options.getString('url')! }
            : {}),
          ...(i.options.getString('query')
            ? { query: i.options.getString('query')! }
            : {}),
        }
      : {}),
  });
  await new GameMenu(i, c, game).start();
}
