import { describe, expect, it, vi } from 'vitest';
import volume from '../apps/bot/src/commands/music/volume.js';
import repeat from '../apps/bot/src/commands/music/repeat.js';
import filter from '../apps/bot/src/commands/music/filter.js';
const make = (
  strings: Record<string, string> = {},
  amount: number | null = null,
) => ({
  guildId: 'g',
  user: { id: 'u' },
  guild: { voiceStates: { cache: new Map([['u', { channelId: 'v' }]]) } },
  options: {
    getString: (key: string) => strings[key] ?? null,
    getInteger: () => amount,
  },
  reply: vi.fn(),
});
describe('thin advanced control commands', () => {
  it('routes volume and supports status without mutation', async () => {
    const music = {
      assertVoiceChannel: vi.fn(),
      playback: () => ({ volume: 75 }),
      setVolume: vi.fn(),
    };
    const status = make();
    await volume.execute(status as never, { music } as never);
    expect(music.setVolume).not.toHaveBeenCalled();
    expect(status.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('75') }),
    );
    await volume.execute(make({}, 50) as never, { music } as never);
    expect(music.setVolume).toHaveBeenCalledWith('g', 50);
  });
  it('routes repeat and trusted filters with status/reset', async () => {
    const music = {
      assertVoiceChannel: vi.fn(),
      setRepeat: vi.fn(),
      setFilter: vi.fn(),
      playback: () => ({ filter: 'bassboost' }),
      queue: () => ({ repeatMode: 'queue' }),
    };
    await repeat.execute(make({ mode: 'track' }) as never, { music } as never);
    expect(music.setRepeat).toHaveBeenCalledWith('g', 'track');
    await filter.execute(
      make({ preset: 'reset' }) as never,
      { music } as never,
    );
    expect(music.setFilter).toHaveBeenCalledWith('g', 'flat');
    await filter.execute(
      make({ preset: 'status' }) as never,
      { music } as never,
    );
    expect(music.setFilter).toHaveBeenCalledTimes(1);
  });
});
