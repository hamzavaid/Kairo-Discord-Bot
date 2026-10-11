import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { PlaybackSession } from '../packages/music-engine/src/playback/PlaybackSession.js';
import { libraryTrack } from './helpers/libraryModel.js';
function setup() {
  const onAttempt = vi.fn();
  const player = Object.assign(new EventEmitter(), {
    play: vi.fn(),
    stop: vi.fn(),
    pause: () => true,
    unpause: () => true,
  });
  const session = new PlaybackSession({
    guildId: 'g',
    player: player as never,
    onAttempt,
    resolver: {
      resolve: async () => ({
        kind: 'readable',
        input: Readable.from([]),
        inputType: 'opus',
        sourceProvider: 'fixture',
        seekable: false,
      }),
    },
    createResource: (() => ({
      metadata: { generation: 1 },
      volume: { setVolume() {} },
    })) as never,
  });
  session.attach({ subscribe: () => ({ unsubscribe() {} }) } as never);
  return { onAttempt, player, session };
}
describe('playback lifecycle history DTOs', () => {
  it('records one start and one terminal event across pause/resume and idempotent cleanup', async () => {
    const { session, player, onAttempt } = setup();
    session.start(
      {
        id: 'entry',
        track: { ...libraryTrack, sourceProvider: 'youtube-sr' },
        enqueuedBy: 'u',
        enqueuedAt: new Date(),
      },
      1,
    );
    await vi.waitFor(() => expect(player.play).toHaveBeenCalled());
    player.emit('stateChange', { status: 'buffering' }, { status: 'playing' });
    session.pause();
    session.resume();
    session.stop('skipped');
    session.stop('skipped');
    session.disconnect();
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt.mock.calls[0]?.[0]).toMatchObject({
      status: 'playing',
      source: 'manual',
    });
    expect(onAttempt.mock.calls[1]?.[0]).toMatchObject({
      status: 'skipped',
      listenedMs: expect.any(Number),
    });
    expect(onAttempt.mock.calls[0]?.[0].attemptId).toBe(
      onAttempt.mock.calls[1]?.[0].attemptId,
    );
  });
  it('records failed resolution without completed listening or duplicate terminal events', async () => {
    const onAttempt = vi.fn();
    const session = new PlaybackSession({
      guildId: 'g',
      player: Object.assign(new EventEmitter(), { stop() {} }) as never,
      resolver: {
        resolve: async () => {
          throw new Error('secret');
        },
      },
      onAttempt,
    });
    session.attach({ subscribe: () => ({ unsubscribe() {} }) } as never);
    session.start(
      {
        id: 'entry',
        track: { ...libraryTrack, sourceProvider: 'youtube-sr' },
        enqueuedBy: 'u',
        enqueuedAt: new Date(),
      },
      1,
    );
    await vi.waitFor(() => expect(onAttempt).toHaveBeenCalledOnce());
    expect(onAttempt.mock.calls[0]?.[0]).toMatchObject({
      status: 'failed',
      listenedMs: 0,
    });
    expect(JSON.stringify(onAttempt.mock.calls)).not.toContain('secret');
    session.disconnect();
  });
});

it('estimates audible time deterministically without counting paused intervals', async () => {
  let clock = 100;
  const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const { session, player, onAttempt } = setup();
  try {
    session.start(
      {
        id: 'timed',
        track: libraryTrack as never,
        enqueuedBy: 'u',
        enqueuedAt: new Date(),
      },
      1,
    );
    await vi.waitFor(() => expect(player.play).toHaveBeenCalled());
    player.emit('stateChange', { status: 'buffering' }, { status: 'playing' });
    clock = 200;
    session.pause();
    clock = 700;
    session.resume();
    clock = 1000;
    session.stop('completed');
    expect(onAttempt.mock.calls.at(-1)?.[0]).toMatchObject({
      status: 'completed',
      listenedMs: 400,
    });
    expect(onAttempt).toHaveBeenCalledTimes(2);
  } finally {
    session.disconnect();
    now.mockRestore();
  }
});
