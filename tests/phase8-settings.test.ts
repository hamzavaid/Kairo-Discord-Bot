import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GUILD_CONTROLS,
  normalizeGuildControls,
  validateGuildControls,
  MongoGuildSettingsRepository,
} from '../packages/data/src/GuildSettingsRepository.js';

describe('Phase 8 persistent guild controls', () => {
  it('normalizes old settings without changing quality or idle settings', () => {
    expect(normalizeGuildControls(undefined)).toEqual(DEFAULT_GUILD_CONTROLS);
    expect(normalizeGuildControls({ volume: 40 })).toEqual({
      ...DEFAULT_GUILD_CONTROLS,
      volume: 40,
    });
  });
  it('rejects invalid volume, filter, repeat, threshold, policy and channel state', () => {
    for (const patch of [
      { volume: -1 },
      { volume: 101 },
      { volume: NaN },
      { filter: 'arbitrary graph' },
      { repeat: 'all' },
      { voteThreshold: 0 },
      { voteThreshold: 1.1 },
      { controlPolicy: 'developer' },
      { cooldownSeconds: -1 },
      { allowedTextChannels: ['bad'] },
    ])
      expect(() => validateGuildControls(patch as never)).toThrow();
  });
  it('persists controls across repository reconstruction and isolates guilds', async () => {
    const records = new Map<string, Record<string, unknown>>();
    const model = {
      findOne: ({ guildId }: { guildId: string }) => ({
        lean: () => ({ exec: async () => records.get(guildId) ?? null }),
      }),
      findOneAndUpdate: (
        { guildId }: { guildId: string },
        { $set }: { $set: Record<string, unknown> },
      ) => ({
        exec: async () => {
          const value = { ...records.get(guildId) };
          for (const [key, setting] of Object.entries($set)) {
            if (key.startsWith('controls.'))
              value.controls = {
                ...((value.controls as object) ?? {}),
                [key.slice(9)]: setting,
              };
            else value[key] = setting;
          }
          records.set(guildId, value);
          return value;
        },
      }),
    };
    const connection = { model: () => model } as never;
    const first = new MongoGuildSettingsRepository(connection);
    await first.setControls('a', {
      volume: 30,
      autoplay: true,
      djRoleId: '123456789012345678',
      controlPolicy: 'dj',
      filter: 'bassboost',
      repeat: 'queue',
    });
    const second = new MongoGuildSettingsRepository(connection);
    expect(
      normalizeGuildControls((await second.get('a')).controls),
    ).toMatchObject({
      volume: 30,
      autoplay: true,
      controlPolicy: 'dj',
      repeat: 'queue',
      filter: 'bassboost',
    });
    expect(normalizeGuildControls((await second.get('b')).controls)).toEqual(
      DEFAULT_GUILD_CONTROLS,
    );
    await second.setIdleDisconnectSeconds('a', 90);
    expect(
      normalizeGuildControls((await second.get('a')).controls).volume,
    ).toBe(30);
  });
});
