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
