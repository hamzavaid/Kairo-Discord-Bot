import { EventEmitter } from 'node:events';
import { libraryTrack } from './helpers/libraryModel.js';
import { expect, it, vi } from 'vitest';
import history from '../apps/bot/src/commands/utility/history.js';
import stats from '../apps/bot/src/commands/utility/stats.js';
import top from '../apps/bot/src/commands/utility/top.js';
it('registers scoped history/statistics and top songs/artists periods', () => {
  expect(history.data.name).toBe('history');
  expect(stats.data.name).toBe('stats');
  expect(top.data.toJSON().options?.map((o) => o.name)).toEqual([
    'songs',
    'artists',
  ]);
});
it('history is requester-scoped and does not touch playback', async () => {
  const i = {
    id: 'id',
    user: { id: 'u' },
    guildId: 'g',
    options: { getInteger: () => 1 },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
  const list = vi.fn(async () => []);
  await history.execute(i as never, { history: { list }, music: {} } as never);
  expect(list).toHaveBeenCalledWith({ userId: 'u' }, 1, 10);
  expect(i.editReply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('No listening history'),
    }),
  );
});

it('never reads beyond the final history page and disables expired controls', async () => {
  const collector = new EventEmitter();
  const list = vi.fn(async (_scope: unknown, page: number) => {
    if (page > 1000) throw RangeError('Invalid history page');
    return [
      {
        track: libraryTrack,
        status: 'completed',
        listenedMs: 1000,
        requestedAt: new Date(),
      },
    ];
  });
  const editReply = vi.fn(async (_options: unknown) => {
    void _options;
    return { createMessageComponentCollector: () => collector };
  });
  await history.execute(
    {
      id: 'last',
      user: { id: 'u' },
      options: { getInteger: () => 1000 },
      deferReply: vi.fn(),
      editReply,
    } as never,
    { history: { list } } as never,
  );
  expect(list).toHaveBeenCalledTimes(1);
  collector.emit('end');
  await new Promise((r) => setImmediate(r));
  const payload = editReply.mock.calls.at(-1)?.[0] as unknown as {
    components: { toJSON(): { components: { disabled: boolean }[] } }[];
  };
  expect(
    payload.components[0]?.toJSON().components.every((c) => c.disabled),
  ).toBe(true);
});
