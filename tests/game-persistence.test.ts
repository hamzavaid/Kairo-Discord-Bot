import { describe, expect, it, vi } from 'vitest';
import {
  MongoGameRepository,
  DEFAULT_GAME_SETTINGS,
} from '../packages/data/src/GameRepository.js';
function storage() {
  const settings = new Map<string, object>();
  const results = new Map<string, object>();
  const aggregate = vi.fn(async (_pipeline: unknown[]) => {
    void _pipeline;
    return [
      {
        userId: 'u',
        gamesPlayed: 1,
        wins: 1,
        correctSongs: 1,
        correctArtists: 1,
        correctAnswers: 1,
        attempts: 1,
        bestStreak: 1,
        points: 200,
      },
    ];
  });
  const resultModel = {
    init: vi.fn(),
    updateOne: (
      filter: { sessionId: string; userId: string },
      change: { $setOnInsert: object },
    ) => ({
      exec: async () => {
        const key = `${filter.sessionId}:${filter.userId}`;
        if (!results.has(key)) results.set(key, change.$setOnInsert);
      },
    }),
    aggregate,
  };
  const settingModel = {
    init: vi.fn(),
    findOne: ({ guildId }: { guildId: string }) => ({
      lean: () => ({ exec: async () => settings.get(guildId) }),
    }),
    findOneAndUpdate: (
      { guildId }: { guildId: string },
      change: { $set: object },
    ) => ({
      lean: () => ({
        exec: async () => {
          const value = { ...settings.get(guildId), ...change.$set };
          settings.set(guildId, value);
          return value;
        },
      }),
    }),
  };
  return {
    results,
    aggregate,
    connection: {
      model: (name: string) =>
        name === 'KairoGameResult' ? resultModel : settingModel,
    } as never,
  };
}
describe('durable games results and settings', () => {
  it('defaults old guilds, validates settings and preserves them through reconstruction', async () => {
    const db = storage();
    const repo = new MongoGameRepository(db.connection);
    expect(await repo.settings('g')).toEqual(DEFAULT_GAME_SETTINGS);
    await repo.setSettings('g', {
      enabledGames: ['musictrivia'],
      answerSeconds: 20,
      previewSeconds: 8,
    });
    expect(
      await new MongoGameRepository(db.connection).settings('g'),
    ).toMatchObject({
      enabledGames: ['musictrivia'],
      answerSeconds: 20,
      previewSeconds: 8,
    });
    await expect(
      repo.setSettings('g', { previewSeconds: 61 }),
    ).rejects.toThrow();
    expect(await repo.settings('other')).toEqual(DEFAULT_GAME_SETTINGS);
  });
  it('persists immutable idempotent trivia outcomes and aggregates scoped leaderboards', async () => {
    const db = storage();
    const repo = new MongoGameRepository(db.connection);
    const result = {
      sessionId: 's',
      userId: 'u',
      guildId: 'g',
      game: 'musictrivia' as const,
      playedAt: new Date(),
      wins: 1,
      roundsWon: 1,
      correctSongs: 1,
      correctArtists: 1,
      correctAnswers: 1,
      attempts: 1,
      bestStreak: 1,
      points: 200,
    };
    await Promise.all([repo.record(result), repo.record(result)]);
    await new MongoGameRepository(db.connection).record({
      ...result,
      points: 0,
    });
    expect(db.results.size).toBe(1);
    expect([...db.results.values()][0]).toMatchObject({ points: 200 });
    expect((await repo.leaderboard('g', 'musictrivia'))[0]).toMatchObject({
      correctSongs: 1,
      wins: 1,
    });
    expect(db.aggregate.mock.calls[0]?.[0]).toContainEqual({
      $match: { guildId: 'g', game: 'musictrivia' },
    });
    await expect(repo.record({ ...result, wins: -1 })).rejects.toThrow();
  });
});
