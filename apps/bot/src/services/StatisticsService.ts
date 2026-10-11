import type {
  HistoryRepository,
  HistoryScope,
  LibraryRepository,
} from '@kairo/data';
export type StatisticsPeriod = 'week' | 'month' | 'all';
export class StatisticsService {
  constructor(
    private readonly history: HistoryRepository,
    private readonly library?: LibraryRepository,
  ) {}
  async get(
    scope: HistoryScope,
    period: StatisticsPeriod = 'all',
    now = new Date(),
  ) {
    if (!['week', 'month', 'all'].includes(period))
      throw new RangeError('Invalid statistics period.');
    const since =
      period === 'all'
        ? undefined
        : new Date(now.getTime() - (period === 'week' ? 7 : 30) * 86400000);
    const records = await this.history.scan(
      { ...scope, ...(since ? { since } : {}) },
      10000,
    );
    const songs = new Map<
      string,
      { identity: string; title: string; listens: number }
    >();
    const artists = new Map<string, { name: string; listens: number }>();
    for (const row of records.filter((r) => r.status === 'completed')) {
      const song = songs.get(row.fingerprint) ?? {
        identity: row.fingerprint,
        title: row.track.title,
        listens: 0,
      };
      song.listens++;
      songs.set(row.fingerprint, song);
      for (const a of new Map(
        row.track.artists.map((a) => [
          a.name.normalize('NFKC').toLowerCase(),
          a,
        ]),
      ).values()) {
        const key = a.name.normalize('NFKC').toLowerCase();
        const artist = artists.get(key) ?? { name: a.name, listens: 0 };
        artist.listens++;
        artists.set(key, artist);
      }
    }
    const owned =
      this.library && scope.userId ? await this.library.list(scope.userId) : [];
    const liked =
      this.library && scope.userId
        ? await this.library.liked(scope.userId)
        : undefined;
    return {
      period,
      requests: records.length,
      completed: records.filter((r) => r.status === 'completed').length,
      listenedMs: records
        .filter((r) => r.status !== 'failed')
        .reduce((sum, r) => sum + r.listenedMs, 0),
      skips: records.filter((r) => r.status === 'skipped').length,
      failures: records.filter((r) => r.status === 'failed').length,
      activeUsers: new Set(records.map((r) => r.userId)).size,
      manual: records.filter((r) => r.source === 'manual').length,
      autoplay: records.filter((r) => r.source === 'autoplay').length,
      songs: [...songs.values()].sort(
        (a, b) => b.listens - a.listens || a.identity.localeCompare(b.identity),
      ),
      artists: [...artists.values()].sort(
        (a, b) => b.listens - a.listens || a.name.localeCompare(b.name),
      ),
      playlists: owned.length,
      likedSongs: liked?.entries.length ?? 0,
      retainedDays: 180,
      truncated: records.length === 10000,
    };
  }
}
