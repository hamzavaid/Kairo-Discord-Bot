import { expect, it, vi } from 'vitest';
import {
  commandRegistrationData,
  createSlashCommandHandler,
} from '../apps/bot/src/commands/slashCommandHandler.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { libraryTrack } from './helpers/libraryModel.js';
it('registers message actions alongside unchanged slash aliases', () => {
  const data = commandRegistrationData();
  expect(data.filter((c) => c.type === 3).map((c) => c.name)).toEqual([
    'Play Song',
    'Search Music',
    'Add to Queue',
    'Play Next',
    'Song Info',
  ]);
  expect(data.find((c) => c.name === 'search')?.options).toEqual(
    data.find((c) => c.name === 'info')?.options,
  );
});
it('routes real message interactions through canonical services and audits the invocation', async () => {
  const playNext = vi.fn(async () => ({ track: libraryTrack, position: 1 }));
  const music = {
    playNext,
    assertVoiceChannel: vi.fn(),
    info: vi.fn(async () => libraryTrack),
  };
  const audit = new AuditLog();
  const handler = createSlashCommandHandler({
    music: music as never,
    audit,
    settings: {} as never,
    developerIds: new Set(),
  });
  const i = {
    commandName: 'Play Next',
    guildId: 'g',
    user: { id: 'u' },
    targetMessage: {
      content: 'Listen to https://www.youtube.com/watch?v=abcdefghijk',
    },
    isMessageContextMenuCommand: () => true,
    guild: {
      voiceAdapterCreator: vi.fn(),
      voiceStates: { cache: new Map([['u', { channelId: 'v' }]]) },
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    reply: vi.fn(),
  };
  await handler.execute(i as never);
  expect(playNext).toHaveBeenCalledWith(
    expect.objectContaining({
      query: 'https://www.youtube.com/watch?v=abcdefghijk',
      userId: 'u',
    }),
  );
  expect(audit.list()[0]).toMatchObject({
    command: 'Play Next',
    success: true,
    userId: 'u',
  });
  await handler.execute({ ...i, commandName: 'Song Info' } as never);
  expect(music.info).toHaveBeenCalledWith(
    'https://www.youtube.com/watch?v=abcdefghijk',
    'g',
    'u',
  );
});
