import { vi } from 'vitest';

/** Existing repository test strategy: persistent fake Mongo model with atomic version filters. */
export function libraryModel() {
  const records = new Map<string, Record<string, unknown>>();
  const matches = (
    record: Record<string, unknown>,
    filter: Record<string, unknown>,
  ) => Object.entries(filter).every(([key, value]) => record[key] === value);
  const find = (filter: Record<string, unknown>) =>
    [...records.values()].find((record) => matches(record, filter));
  const query = (get: () => unknown) => ({
    lean: () => ({ exec: async () => structuredClone(get()) }),
    exec: async () => structuredClone(get()),
  });
  const model = {
    init: vi.fn(async () => {}),
    create: vi.fn(async (record: Record<string, unknown>) => {
      if (
        [...records.values()].some(
          (r) =>
            r.ownerUserId === record.ownerUserId &&
            r.normalizedName === record.normalizedName,
        )
      )
        throw Object.assign(new Error('duplicate'), { code: 11000 });
      records.set(record.id as string, structuredClone(record));
      return structuredClone(record);
    }),
    findOne: vi.fn((filter: Record<string, unknown>) =>
      query(() => find(filter) ?? null),
    ),
    find: vi.fn((filter: Record<string, unknown>) => ({
      sort: () =>
        query(() =>
          [...records.values()]
            .filter((r) => matches(r, filter))
            .sort((a, b) => String(a.id).localeCompare(String(b.id))),
        ),
    })),
    findOneAndUpdate: vi.fn(
      (
        filter: Record<string, unknown>,
        update: {
          $set?: Record<string, unknown>;
          $inc?: { version: number };
          $setOnInsert?: Record<string, unknown>;
        },
        options?: { upsert?: boolean },
      ) =>
        query(() => {
          let record = find(filter);
          if (!record && options?.upsert) {
            record = structuredClone(update.$setOnInsert!);
            records.set(record.id as string, record);
          }
          if (!record) return null;
          Object.assign(record, structuredClone(update.$set ?? {}));
          if (update.$inc)
            record.version = Number(record.version) + update.$inc.version;
          return record;
        }),
    ),
    deleteOne: vi.fn((filter: Record<string, unknown>) => ({
      exec: async () => {
        const record = find(filter);
        if (record) records.delete(record.id as string);
        return { deletedCount: record ? 1 : 0 };
      },
    })),
  };
  return { records, model, connection: { model: () => model } as never };
}

export const libraryTrack = {
  id: 'youtube-sr:abcdefghijk',
  title: 'Song',
  artists: [{ name: 'Artist' }],
  sourceProvider: 'youtube-sr',
  sourceId: 'abcdefghijk',
  durationMs: 180000,
  isLive: false,
  requestedBy: 'user',
  createdAt: new Date(),
  provenance: { input: 'Song', parsedBy: 'youtube-sr' },
};
