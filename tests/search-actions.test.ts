import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import info from '../apps/bot/src/commands/utility/info.js';
import { libraryTrack } from './helpers/libraryModel.js';
it('search displays selected-track play/next/queue/save actions without playback until clicked', async () => {
  const collector = new EventEmitter();
  const playTracks = vi.fn(async () => ({ upcoming: [] }));
  const editReply = vi.fn(async () => ({
    createMessageComponentCollector: () => collector,
  }));
  const interaction = {
    id: 'search',
    guildId: 'g',
    user: { id: 'u' },
    options: { getInteger: () => 2, getString: () => 'song' },
    deferReply: vi.fn(),
    editReply,
  };
  const context = {
    music: {
      infoResults: async () => [libraryTrack],
      assertVoiceChannel: vi.fn(),
      playTracks,
    },
    library: { likeSaved: vi.fn() },
  };
  await info.execute(interaction as never, context as never);
  const text = JSON.stringify(editReply.mock.calls);
  expect(text).toContain('Play next');
  expect(text).toContain('Add to playlist');
  expect(playTracks).not.toHaveBeenCalled();
  const click = {
    customId: 'kairo:info:search:play-next:0',
    user: { id: 'u' },
    guildId: 'g',
    guild: {
      voiceStates: { cache: new Map([['u', { channelId: 'v' }]]) },
      voiceAdapterCreator: () => {},
    },
    isButton: () => true,
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
  };
  collector.emit('collect', click);
  await vi.waitFor(() =>
    expect(playTracks).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: [libraryTrack],
        position: 'next',
        userId: 'u',
      }),
    ),
  );
});

it('rechecks the server channel policy before queueing an old search result', async () => {
  const collector = new EventEmitter();
  const playTracks = vi.fn();
  const admit = vi.fn(() => {
    throw Error('channel blocked');
  });
  await info.execute(
    {
      id: 'blocked',
      guildId: 'g',
      user: { id: 'u' },
      options: { getInteger: () => 2, getString: () => 'song' },
      deferReply: vi.fn(),
      editReply: async () => ({
        createMessageComponentCollector: () => collector,
      }),
    } as never,
    {
      music: {
        infoResults: async () => [libraryTrack],
        assertVoiceChannel: vi.fn(),
        playTracks,
      },
      policy: { admit },
      settings: { get: async () => ({ controls: {} }) },
    } as never,
  );
  const followUp = vi.fn();
  collector.emit('collect', {
    customId: 'kairo:info:blocked:play:0',
    guildId: 'g',
    channelId: 'text',
    user: { id: 'u' },
    guild: {
      voiceStates: { cache: new Map([['u', { channelId: 'v' }]]) },
      voiceAdapterCreator: () => {},
    },
    isButton: () => true,
    deferUpdate: vi.fn(),
    followUp,
  });
  await vi.waitFor(() => expect(followUp).toHaveBeenCalled());
  expect(admit).toHaveBeenCalled();
  expect(playTracks).not.toHaveBeenCalled();
});

it('search nickname defaults to five candidates while info keeps one result', async () => {
  const music = {
    info: vi.fn(async () => libraryTrack),
    infoResults: vi.fn(async () => [libraryTrack]),
  };
  const make = (commandName: string) => ({
    commandName,
    id: commandName,
    guildId: 'g',
    user: { id: 'u' },
    options: { getInteger: () => null, getString: () => 'song' },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  });
  await info.execute(make('search') as never, { music } as never);
  expect(music.infoResults).toHaveBeenCalledWith('song', 'g', 'u', 5);
  expect(music.info).not.toHaveBeenCalled();
  await info.execute(make('info') as never, { music } as never);
  expect(music.info).toHaveBeenCalledWith('song', 'g', 'u');
});
