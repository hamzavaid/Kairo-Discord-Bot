import { CommandError } from '../apps/bot/src/errors.js';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryService } from '../apps/bot/src/services/DiscoveryService.js';
import discover from '../apps/bot/src/commands/utility/discover.js';
import { libraryTrack } from './helpers/libraryModel.js';
describe('provider-neutral discovery prototype', () => {
  it('loads canonical liked/recent/search/artist sections with owner isolation and no playback', async () => {
    const liked = vi.fn(async () => ({
      entries: [{ track: libraryTrack }, { track: libraryTrack }],
    }));
    const recent = vi.fn(async () => [{ track: libraryTrack }]);
    const infoResults = vi.fn(async () => [libraryTrack]);
    const service = new DiscoveryService(
      { infoResults, currentTrack: () => libraryTrack } as never,
      { recommend: async () => [libraryTrack] } as never,
      { liked } as never,
      { recent } as never,
    );
    expect(
      (await service.load('liked', { guildId: 'g', userId: 'u' })).tracks,
    ).toHaveLength(1);
    expect(liked).toHaveBeenCalledWith('u');
    expect(
      (await service.load('recent', { guildId: 'g', userId: 'u' })).tracks,
    ).toHaveLength(1);
    expect(recent).toHaveBeenCalledWith({ userId: 'u' }, 100);
    await service.load('search', { guildId: 'g', userId: 'u', query: 'Song' });
    expect(infoResults).toHaveBeenCalledWith('Song', 'g', 'u', 25, undefined);
    expect(
      (await service.load('artists', { guildId: 'g', userId: 'u' })).tracks,
    ).toHaveLength(1);
  });
  it('renders finite owner-scoped section navigation and reuses the actionable result browser', async () => {
    const collector = Object.assign(new EventEmitter(), { stop: vi.fn() });
    const create = vi.fn((_options: unknown) => {
      void _options;
      return collector;
    });
    const load = vi.fn(async () => ({
      section: 'liked',
      title: 'Liked Songs',
      tracks: [libraryTrack],
    }));
    const editReply = vi.fn(async () => ({
      createMessageComponentCollector: create,
    }));
    await discover.execute(
      {
        id: 'discovery',
        guildId: 'g',
        user: { id: 'u' },
        options: { getString: () => null },
        deferReply: vi.fn(),
        editReply,
      } as never,
      {
        discovery: { load },
        music: {},
        reportComponentError: vi.fn(),
      } as never,
    );
    expect(JSON.stringify(editReply.mock.calls)).toContain('Browse songs');
    expect(create.mock.calls[0]?.[0]).toMatchObject({ time: 120000 });
    const filter = (
      create.mock.calls[0]?.[0] as unknown as {
        filter: (i: unknown) => boolean;
      }
    ).filter;
    expect(
      filter({
        user: { id: 'other' },
        customId: 'kairo:discover:discovery:section',
      }),
    ).toBe(false);
    collector.emit('end');
  });
});

it('serializes discovery edits so expiration cannot be overtaken by an in-flight refresh', async () => {
  const collector = new EventEmitter();
  let release!: () => void;
  const blocked = new Promise<void>((r) => {
    release = r;
  });
  const editReply = vi.fn(async () => ({
    createMessageComponentCollector: () => collector,
  }));
  editReply.mockImplementationOnce(async () => ({
    createMessageComponentCollector: () => collector,
  }));
  editReply.mockImplementationOnce(async () => {
    await blocked;
    return { createMessageComponentCollector: () => collector };
  });
  await discover.execute(
    {
      id: 'expiry',
      guildId: 'g',
      user: { id: 'u' },
      options: { getString: () => null },
      deferReply: vi.fn(),
      editReply,
    } as never,
    {
      discovery: {
        load: async () => ({
          title: 'Songs',
          section: 'recommended',
          tracks: [libraryTrack],
        }),
      },
      music: {},
    } as never,
  );
  collector.emit('collect', {
    customId: 'kairo:discover:expiry:refresh',
    user: { id: 'u' },
    isStringSelectMenu: () => false,
    update: vi.fn(),
  });
  await vi.waitFor(() => expect(editReply).toHaveBeenCalledTimes(2));
  collector.emit('end');
  await new Promise((r) => setImmediate(r));
  expect(editReply).toHaveBeenCalledTimes(2);
  release();
  await vi.waitFor(() => expect(editReply).toHaveBeenCalledTimes(3));
  expect(JSON.stringify(editReply.mock.calls.at(-1))).toContain('Menu expired');
});

it('opens useful empty discovery sections for a user without a seed', async () => {
  const service = new DiscoveryService(
    {} as never,
    {
      recommend: async () => {
        throw new CommandError(
          'RECOMMENDATION_UNAVAILABLE',
          'Play or like a song first.',
        );
      },
    } as never,
    {} as never,
    {} as never,
  );
  expect(
    await service.load('recommended', { guildId: 'g', userId: 'new' }),
  ).toMatchObject({ tracks: [], notice: 'Play or like a song first.' });
});
