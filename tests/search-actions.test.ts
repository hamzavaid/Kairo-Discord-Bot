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
