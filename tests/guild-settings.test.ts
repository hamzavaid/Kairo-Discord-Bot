import { describe, expect, it, vi } from 'vitest';
import {
  MongoGuildSettingsRepository,
  validateIdleDisconnectSeconds,
} from '../packages/data/src/GuildSettingsRepository.js';

describe('persisted guild voice settings', () => {
  it('defaults each guild to 60 seconds and uses a guild-scoped Mongo upsert', async () => {
    const records = new Map<string, number>();
    const update = vi.fn(
      (
        filter: { guildId: string },
        change: { $set: { idleDisconnectSeconds: number } },
      ) => ({
        exec: async () => {
          records.set(filter.guildId, change.$set.idleDisconnectSeconds);
          return {
            guildId: filter.guildId,
            idleDisconnectSeconds: change.$set.idleDisconnectSeconds,
          };
        },
      }),
    );
    const model = {
      findOne: (filter: { guildId: string }) => ({
        lean: () => ({
          exec: async () =>
            records.has(filter.guildId)
              ? {
                  guildId: filter.guildId,
                  idleDisconnectSeconds: records.get(filter.guildId),
                }
              : null,
        }),
      }),
      findOneAndUpdate: update,
    };
    const connection = { model: () => model } as never;
    const first = new MongoGuildSettingsRepository(connection);
    expect(await first.get('a')).toEqual({
      guildId: 'a',
      idleDisconnectSeconds: 60,
    });
    await first.setIdleDisconnectSeconds('a', 120);
    const second = new MongoGuildSettingsRepository(connection);
    expect(await second.get('a')).toEqual({
      guildId: 'a',
      idleDisconnectSeconds: 120,
    });
    expect(await second.get('b')).toEqual({
      guildId: 'b',
      idleDisconnectSeconds: 60,
    });
    expect(update).toHaveBeenCalledWith(
      { guildId: 'a' },
      { $set: { idleDisconnectSeconds: 120 } },
      expect.objectContaining({ upsert: true, runValidators: true }),
    );
  });

  it('rejects invalid timeout values before writing', () => {
    for (const value of [-1, 3601, 1.5, Number.NaN])
      expect(() => validateIdleDisconnectSeconds(value)).toThrow(RangeError);
    expect(() => validateIdleDisconnectSeconds(0)).not.toThrow();
  });
});
