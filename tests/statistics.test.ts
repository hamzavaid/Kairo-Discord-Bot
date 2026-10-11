import { describe, expect, it, vi } from 'vitest';
import { StatisticsService } from '../apps/bot/src/services/StatisticsService.js';
import { libraryTrack } from './helpers/libraryModel.js';
const row = (id: string, status: string, userId = 'u', source = 'manual') => ({
  attemptId: id,
  userId,
  guildId: 'g',
  track: libraryTrack,
  fingerprint: 'youtube:abcdefghijk',
  requestedAt: new Date(),
  status,
  source,
  listenedMs: 1000,
});
describe('retained listening statistics', () => {
  it('aggregates completed listens separately from requests/skips/failures', async () => {
    const scan = vi.fn(async () => [
      row('a', 'completed'),
      row('b', 'completed', 'v', 'autoplay'),
      row('c', 'skipped'),
      row('d', 'failed'),
    ]);
    const service = new StatisticsService({ scan } as never);
    const stats = await service.get(
      { guildId: 'g' },
      'week',
      new Date('2026-10-11T00:00:00Z'),
    );
    expect(stats).toMatchObject({
      completed: 2,
      requests: 4,
      listenedMs: 3000,
      skips: 1,
      failures: 1,
      activeUsers: 2,
      manual: 3,
      autoplay: 1,
    });
    expect(stats.songs[0]).toMatchObject({ title: 'Song', listens: 2 });
    expect(stats.artists[0]).toMatchObject({ name: 'Artist', listens: 2 });
    expect(scan).toHaveBeenCalledWith(
      { guildId: 'g', since: new Date('2026-10-04T00:00:00Z') },
      10000,
    );
  });
  it('uses month and retained all-time windows with deterministic top ties and requester isolation', async () => {
    const scan = vi.fn(async () => []);
    const service = new StatisticsService({ scan } as never);
    await service.get(
      { userId: 'u' },
      'month',
      new Date('2026-10-11T00:00:00Z'),
    );
    expect(scan).toHaveBeenCalledWith(
      { userId: 'u', since: new Date('2026-09-11T00:00:00Z') },
      10000,
    );
    await service.get({ userId: 'u' }, 'all');
    expect(scan).toHaveBeenLastCalledWith({ userId: 'u' }, 10000);
    await expect(
      service.get({ userId: 'u' }, 'invalid' as never),
    ).rejects.toThrow();
  });
});
