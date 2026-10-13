import { MessageFlags } from 'discord.js';
import { GameError } from '@kairo/games';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { GameSession } from '@kairo/games';
import { GameMenu, gameCard } from '../apps/bot/src/commands/games/GameMenu.js';
import musictrivia from '../apps/bot/src/commands/games/musictrivia.js';
import games from '../apps/bot/src/commands/games/games.js';
import invite from '../apps/bot/src/commands/context/InviteToGame.js';
it('registers game setup, all-game menu, statistics, leaderboards and user invites', () => {
  expect(musictrivia.data.toJSON().options?.map((o) => o.name)).toEqual(
    expect.arrayContaining([
      'rounds',
      'answer',
      'source',
      'playlist',
      'url',
      'query',
      'difficulty',
    ]),
  );
  expect(games.data.toJSON().options?.map((o) => o.name)).toEqual([
    'menu',
    'stats',
    'leaderboard',
    'settings',
  ]);
  expect(invite.data.toJSON()).toMatchObject({
    name: 'Invite to Game',
    type: 2,
  });
});
it('renders spectator-safe trivia and keeps answers outside all component payloads', () => {
  const game = new GameSession({
    id: 'hidden',
    guildId: 'g',
    channelId: 'c',
    hostId: 'a',
    kind: 'musictrivia',
    tracks: [
      { id: 'secret-id', title: 'Secret Song', artists: ['Secret Artist'] },
    ],
    now: 0,
  });
  game.start('a', 1);
  const json = JSON.stringify(gameCard(game.view()));
  expect(json).not.toContain('Secret');
  expect(json).not.toContain('secret-id');
  expect(json).toContain('Guess');
  expect(json).toContain('Spectate');
});
it('scopes game components to their message/guild, routes actors to the shared service, and cleans timers on expiry', async () => {
  const game = new GameSession({
    id: 'ui',
    guildId: 'g',
    channelId: 'c',
    hostId: 'a',
    kind: 'hangman',
    word: 'Music',
    now: 0,
  });
  const collector = Object.assign(new EventEmitter(), { stop: vi.fn() });
  const editReply = vi.fn(async () => ({
    createMessageComponentCollector: () => collector,
  }));
  const stop = vi.fn(async () => {});
  const tick = vi.fn(async () => {});
  const menu = new GameMenu(
    {
      id: 'i',
      guildId: 'g',
      channelId: 'c',
      user: { id: 'a' },
      editReply,
    } as never,
    { games: { stop, tick }, reportComponentError: vi.fn() } as never,
    game,
  );
  await menu.start();
  collector.emit('collect', {
    customId: 'kairo:game:ui:spectate:0',
    guildId: 'g',
    user: { id: 'viewer' },
    isButton: () => true,
    deferUpdate: vi.fn(),
  });
  await vi.waitFor(() => expect(game.view().spectators).toContain('viewer'));
  collector.emit('end');
  await vi.waitFor(() => expect(stop).toHaveBeenCalledWith(game, 'a'));
});

it('routes user game invitations through handler authorization and safe auditing', async () => {
  const audit = new AuditLog();
  const handler = createSlashCommandHandler({
    music: {},
    settings: {},
    audit,
    developerIds: new Set(),
  } as never);
  expect(handler.registrationData().filter((c) => c.type === 2)).toEqual([
    expect.objectContaining({ name: 'Invite to Game' }),
  ]);
  const reply = vi.fn();
  await handler.execute({
    commandName: 'Invite to Game',
    guildId: 'g',
    user: { id: 'host' },
    targetUser: { id: 'bot', bot: true },
    isUserContextMenuCommand: () => true,
    reply,
  } as never);
  expect(reply).toHaveBeenCalledWith(
    expect.objectContaining({ content: 'Invite another human player.' }),
  );
  expect(audit.list()[0]).toMatchObject({
    command: 'Invite to Game',
    success: false,
    errorCode: 'GAME_INVALID',
  });
});

it('reports errors after a Components V2 response as safe follow-ups instead of invalid content edits', async () => {
  const handler = createSlashCommandHandler({
    music: {},
    settings: {},
    audit: new AuditLog(),
    developerIds: new Set(),
  } as never);
  const original = handler.get('games')!;
  handler.commands.set('games', {
    ...original,
    execute: async () => {
      throw new GameError('GAME_INVALID', 'A safe game error.');
    },
  });
  const editReply = vi.fn(),
    followUp = vi.fn();
  await handler.execute({
    commandName: 'games',
    guildId: 'g',
    user: { id: 'u' },
    deferred: true,
    replied: true,
    editReply,
    followUp,
  } as never);
  expect(editReply).not.toHaveBeenCalled();
  expect(followUp).toHaveBeenCalledWith({
    content: 'A safe game error.',
    flags: MessageFlags.Ephemeral,
  });
});
