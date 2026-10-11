import { describe, expect, it, vi } from 'vitest';
import {
  MongoHistoryRepository,
  historySchema,
  MongoAuditRepository,
} from '../packages/data/src/HistoryRepository.js';
import { libraryTrack } from './helpers/libraryModel.js';
function storage() {
  const records = new Map<string, Record<string, unknown>>();
  const model = {
    init: vi.fn(),
    updateOne: vi.fn(
      (
        filter: { attemptId: string },
        change: {
          $setOnInsert: Record<string, unknown>;
          $set: Record<string, unknown>;
        },
      ) => ({
        exec: async () => {
          records.set(filter.attemptId, {
            ...(records.has(filter.attemptId) ? {} : change.$setOnInsert),
            ...records.get(filter.attemptId),
            ...change.$set,
          });
        },
      }),
    ),
    find: vi.fn((filter: Record<string, unknown>) => {
      const query = {
        sort: () => query,
        skip: () => query,
        limit: () => query,
        lean: () => query,
        exec: async () =>
          [...records.values()].filter((r) =>
            Object.entries(filter).every(([k, v]) => r[k] === v),
          ),
      };
      return query;
    }),
  };
  return { records, model, connection: { model: () => model } as never };
}
describe('durable listening and audit repositories', () => {
  it('deduplicates attempts across reconstruction, isolates owners and sanitizes tracks', async () => {
    const db = storage();
    const first = new MongoHistoryRepository(db.connection);
    const entry = {
      attemptId: 'attempt',
      guildId: 'g',
      userId: 'u',
      track: {
        ...libraryTrack,
        streamUrl: 'secret',
        canonicalUrl: 'https://bad.invalid/?token=secret',
      },
      requestedAt: new Date(),
      startedAt: new Date(),
      status: 'playing' as const,
      source: 'manual' as const,
      listenedMs: 0,
    };
    await first.record(entry);
    await first.record(entry);
    await new MongoHistoryRepository(db.connection).record({
      ...entry,
      status: 'completed',
      endedAt: new Date(),
      listenedMs: 1000,
    });
    await first.record(entry); // Late duplicate start must not revert the terminal record.
    expect(db.records.size).toBe(1);
    const second = new MongoHistoryRepository(db.connection);
    expect((await second.list({ userId: 'u' }))[0]).toMatchObject({
      status: 'completed',
      fingerprint: 'youtube:abcdefghijk',
      listenedMs: 1000,
    });
    expect(await second.list({ userId: 'other' })).toEqual([]);
    expect(JSON.stringify(db.records.get('attempt'))).not.toContain('secret');
    expect(db.model.updateOne).toHaveBeenCalledWith(
      { attemptId: 'attempt' },
      expect.any(Object),
      expect.objectContaining({ upsert: true, runValidators: true }),
    );
  });
  it('has finite retention and scoped indexes and rejects invalid records', async () => {
    expect(historySchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })],
        [{ guildId: 1, requestedAt: -1, attemptId: 1 }, expect.any(Object)],
        [{ userId: 1, requestedAt: -1, attemptId: 1 }, expect.any(Object)],
      ]),
    );
    const db = storage();
    const repository = new MongoHistoryRepository(db.connection);
    await expect(
      repository.record({ attemptId: '', listenedMs: -1 } as never),
    ).rejects.toThrow();
    expect(db.model.updateOne).not.toHaveBeenCalled();
  });
  it('whitelists audit fields and preserves stable error codes only', async () => {
    const create = vi.fn(async (_entry: unknown) => {
      void _entry;
    });
    const db = { model: () => ({ create }) } as never;
    await new MongoAuditRepository(db).record({
      command: 'play',
      userId: 'u',
      guildId: 'g',
      timestamp: new Date().toISOString(),
      durationMs: 10,
      success: false,
      errorCode: 'STREAM_UNAVAILABLE',
      token: 'secret',
    } as never);
    expect(JSON.stringify(create.mock.calls)).not.toContain('secret');
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      command: 'play',
      errorCode: 'STREAM_UNAVAILABLE',
    });
  });
});
