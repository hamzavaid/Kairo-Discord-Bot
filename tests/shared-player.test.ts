import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import player from '../apps/bot/src/commands/music/player.js';
import { libraryTrack } from './helpers/libraryModel.js';
it('shared player admits another listener and exposes one actor-specific like toggle', async () => {
  const collector = Object.assign(new EventEmitter(), { stop: vi.fn() });
  const perform = vi.fn(async () => 'Skipped.');
  const toggleLikeSaved = vi.fn(async () => ({ liked: true, changed: true }));
  const current = {
    id: 'entry',
    track: libraryTrack,
    enqueuedBy: 'alice',
    enqueuedAt: new Date(),
  };
  const music = {
    queue: () => ({
      guildId: 'g',
      current,
      upcoming: [],
      history: [],
      generation: 1,
      repeatMode: 'off',
    }),
    playback: () => ({
      guildId: 'g',
      current,
      generation: 1,
      state: 'PLAYING',
      volume: 75,
      filter: 'flat',
    }),
    assertVoiceChannel: vi.fn(),
  };
  const editReply = vi.fn(async () => ({
    createMessageComponentCollector: () => collector,
  }));
  const deferReply = vi.fn();
  const guild = {
    voiceStates: { cache: new Map([['bob', { channelId: 'v' }]]) },
    voiceAdapterCreator: vi.fn(),
  };
  await player.execute(
    {
      id: 'shared',
      guildId: 'g',
      guild,
      user: { id: 'alice' },
      options: { getBoolean: () => true },
      deferReply,
      editReply,
    } as never,
    {
      music,
      controls: { perform },
      settings: { get: async () => ({}) },
      library: { toggleLikeSaved },
      reportComponentError: vi.fn(),
    } as never,
  );
  expect(deferReply).toHaveBeenCalledWith({});
  const rendered = JSON.stringify(editReply.mock.calls);
  expect(rendered).toContain('Like/Unlike');
  expect(rendered.match(/Like\/Unlike/gu)).toHaveLength(1);
  const click = (action: string) => ({
    customId: `kairo:player:shared:${action}:1`,
    guildId: 'g',
    guild,
    user: { id: 'bob' },
    isButton: () => true,
    deferUpdate: vi.fn(),
    followUp: vi.fn(),
    reply: vi.fn(),
    update: vi.fn(),
  });
  collector.emit('collect', click('skip'));
  await vi.waitFor(() =>
    expect(perform).toHaveBeenCalledWith(
      'skip',
      expect.objectContaining({ user: { id: 'bob' } }),
      1,
    ),
  );
  await new Promise((r) => setImmediate(r));
  collector.emit('collect', click('like'));
  await vi.waitFor(() =>
    expect(toggleLikeSaved).toHaveBeenCalledWith('bob', libraryTrack),
  );
  const text = JSON.stringify(editReply.mock.calls);
  expect(text).toContain('Lyrics');
  expect(text).toContain('Volume');
  expect(text).toContain('Repeat');
  collector.emit('end');
});
