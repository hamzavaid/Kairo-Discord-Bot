import { expect, it, vi } from 'vitest';
import { playerView } from '../apps/bot/src/commands/music/player/playerView.js';
import seek from '../apps/bot/src/commands/music/seek.js';
import { libraryTrack } from './helpers/libraryModel.js';
const current = {
  id: 'e',
  track: { ...libraryTrack, durationMs: 318000 },
  enqueuedBy: 'u',
  enqueuedAt: new Date(),
};
function render(live = false, unknown = false) {
  return playerView(
    {
      queue: {
        guildId: 'g',
        generation: 3,
        current: {
          ...current,
          track: {
            ...current.track,
            isLive: live,
            ...(unknown ? { durationMs: undefined } : {}),
          },
        },
        upcoming: [],
        history: [],
        repeatMode: 'queue',
      },
      playback: {
        guildId: 'g',
        state: 'PAUSED',
        current,
        generation: 3,
        positionMs: 222000,
        ...(!unknown && !live
          ? { durationMs: 318000, remainingMs: 96000 }
          : {}),
        seekable: !live,
        volume: 35,
      },
      autoplay: true,
    } as never,
    { active: true, busy: false, page: 1, liked: new Set() } as never,
    'kairo:player:i',
    true,
  );
}
it('renders engine elapsed/total/remaining progress and generation-bound seek controls', () => {
  const json = JSON.stringify(render());
  expect(json).toContain('03:42');
  expect(json).toContain('05:18');
  expect(json).toContain('01:36');
  expect(json).toContain('remaining');
  expect(json).toContain('Rewind 10s');
  expect(json).toContain('Forward 10s');
  expect(json).toContain('Seek');
  expect(json).toContain(':rewind:3');
  expect(json).toContain('35%');
  expect(json).toContain('Autoplay: on');
});
it('degrades for live/unknown durations without invented percentages', () => {
  expect(JSON.stringify(render(true))).toContain('LIVE');
  expect(JSON.stringify(render(false, true))).toContain('Duration unknown');
});
it('routes exact timestamp seeks through the authorized control service', async () => {
  const perform = vi.fn();
  const i = {
    guildId: 'g',
    user: { id: 'u' },
    options: { getString: () => '1:30' },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
    guild: { voiceStates: { cache: new Map([['u', { channelId: 'v' }]]) } },
  };
  await seek.execute(
    i as never,
    { music: { assertVoiceChannel: vi.fn() }, controls: { perform } } as never,
  );
  expect(perform).toHaveBeenCalledWith('seek', i, undefined, 90000);
  expect(i.deferReply).toHaveBeenCalledOnce();
});
