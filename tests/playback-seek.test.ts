import type { AudioSource } from '../packages/music-engine/src/stream/AudioSource.js';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { parseSeekTimestamp } from '@kairo/music-engine';
import { PlaybackSession } from '../packages/music-engine/src/playback/PlaybackSession.js';
import { FFmpegPipeline } from '../packages/music-engine/src/stream/FFmpegPipeline.js';
import { libraryTrack } from './helpers/libraryModel.js';
function setup(seekable = true, live = false) {
  let now = 0;
  const ended = vi.fn();
  const attempts = vi.fn();
  const resources: {
    metadata: unknown;
    volume: { setVolume: ReturnType<typeof vi.fn> };
  }[] = [];
  const player = Object.assign(new EventEmitter(), {
    state: { status: 'idle', resource: undefined as unknown },
    play: vi.fn((resource: unknown) => {
      const prior = player.state;
      player.state = { status: 'playing', resource };
      player.emit('stateChange', prior, player.state);
    }),
    stop: vi.fn(() => {
      const prior = player.state;
      player.state = { status: 'idle', resource: undefined };
      player.emit('stateChange', prior, player.state);
      return true;
    }),
    pause: () => true,
    unpause: () => true,
  });
  const resolve = vi.fn(async () => ({
    kind: 'readable' as const,
    input: Readable.from([]),
    inputType: 'opus' as const,
    sourceProvider: 'fixture',
    seekable,
    dispose: vi.fn(),
  }));
  const prepare = vi.fn(
    (source: AudioSource, filter?: string, offset?: number) => {
      void filter;
      void offset;
      if (source.kind !== 'readable')
        throw Error('The mock expects a readable source.');
      return {
        input: source.input,
        inputType: 'opus' as const,
        dispose: () => {
          source.input.destroy();
          source.dispose?.();
        },
      };
    },
  );
  const session = new PlaybackSession({
    guildId: 'g',
    player: player as never,
    resolver: { resolve },
    prepare,
    now: () => now,
    onEnded: ended,
    onAttempt: attempts,
    createResource: ((_i: unknown, options: { metadata: unknown }) => {
      const r = { metadata: options.metadata, volume: { setVolume: vi.fn() } };
      resources.push(r);
      return r;
    }) as never,
  });
  session.attach({ subscribe: () => ({ unsubscribe() {} }) } as never);
  const entry = {
    id: 'entry',
    track: { ...libraryTrack, isLive: live, durationMs: 180000 },
    enqueuedBy: 'u',
    enqueuedAt: new Date(),
  };
  session.start(entry as never, 1);
  return {
    session,
    resolve,
    prepare,
    player,
    ended,
    attempts,
    resources,
    entry,
    clock: (n: number) => {
      now = n;
    },
  };
}
describe('authoritative playback position and seek', () => {
  it('parses exact timestamp forms and rejects invalid/negative positions', () => {
    expect(parseSeekTimestamp('1:30')).toBe(90000);
    expect(parseSeekTimestamp('90')).toBe(90000);
    expect(parseSeekTimestamp('01:02:03')).toBe(3723000);
    for (const text of ['-1', '1:60', '1:2', '1e3', '', '99999999999999999'])
      expect(() => parseSeekTimestamp(text)).toThrow();
  });
  it('freezes paused progress, resumes correctly and resets on track changes', async () => {
    const s = setup();
    await vi.waitFor(() => expect(s.player.play).toHaveBeenCalled());
    s.clock(5200);
    expect(s.session.snapshot()).toMatchObject({
      positionMs: 5200,
      durationMs: 180000,
      remainingMs: 174800,
      seekable: true,
    });
    s.session.pause();
    s.clock(10000);
    expect(s.session.snapshot().positionMs).toBe(5200);
    s.session.resume();
    s.clock(12000);
    expect(s.session.snapshot().positionMs).toBe(7200);
    s.session.stop();
    s.session.start(s.entry as never, 2);
    expect(s.session.snapshot().positionMs).toBe(0);
    s.session.disconnect();
  });
  it('seeks forward/backward without changing entry/generation or losing volume/filter/history', async () => {
    const s = setup();
    await vi.waitFor(() => expect(s.player.play).toHaveBeenCalled());
    s.session.setVolume(35);
    s.session.setFilter('bassboost');
    s.clock(1000);
    await s.session.seek(90000);
    expect(s.session.snapshot()).toMatchObject({
      positionMs: 90000,
      generation: 1,
      current: { id: 'entry' },
      volume: 35,
      filter: 'bassboost',
    });
    expect(s.resources.at(-1)?.volume.setVolume).toHaveBeenLastCalledWith(0.35);
    expect(s.resolve).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.any(AbortSignal),
      expect.objectContaining({ seekOffsetMs: 90000 }),
    );
    await s.session.seek(20000);
    expect(s.session.snapshot().positionMs).toBe(20000);
    s.clock(2000);
    s.session.stop('completed');
    expect(s.attempts).toHaveBeenCalledTimes(2);
    expect(s.attempts.mock.calls.at(-1)?.[0].listenedMs).toBe(2000);
    s.session.disconnect();
  });
  it('preserves paused state on seek and rejects invalid bounds without disposing current audio', async () => {
    const s = setup();
    await vi.waitFor(() => expect(s.player.play).toHaveBeenCalled());
    s.session.pause();
    await s.session.seek(10000);
    expect(s.session.snapshot().state).toBe('PAUSED');
    for (const offset of [-1, 180001, NaN])
      await expect(s.session.seek(offset)).rejects.toMatchObject({
        code: 'INVALID_SEEK_POSITION',
      });
    expect(s.session.snapshot().current?.id).toBe('entry');
    s.session.disconnect();
  });
  it.each([
    [false, false],
    [true, true],
  ])('refuses non-seekable/live sources (%s/%s)', async (seekable, live) => {
    const s = setup(seekable, live);
    await vi.waitFor(() => expect(s.player.play).toHaveBeenCalled());
    await expect(s.session.seek(10000)).rejects.toMatchObject({
      code: 'SEEK_UNSUPPORTED',
    });
    expect(s.player.play).toHaveBeenCalledOnce();
    s.session.disconnect();
  });
  it('ignores end events from a replaced resource', async () => {
    const s = setup();
    await vi.waitFor(() => expect(s.player.play).toHaveBeenCalled());
    const old = s.resources[0];
    await s.session.seek(20000);
    s.player.emit(
      'stateChange',
      { status: 'playing', resource: old },
      { status: 'idle' },
    );
    expect(s.ended).not.toHaveBeenCalled();
    expect(s.session.snapshot().state).toBe('PLAYING');
    s.session.disconnect();
  });
  it.each(['skip', 'end'])(
    'cancels a pending seek when %s supersedes its track',
    async (cause) => {
      const s = setup();
      await vi.waitFor(() => expect(s.player.play).toHaveBeenCalled());
      let finish!: (value: Awaited<ReturnType<typeof s.resolve>>) => void;
      s.resolve.mockImplementationOnce(
        () =>
          new Promise((r) => {
            finish = r;
          }),
      );
      const work = s.session.seek(20000);
      await vi.waitFor(() => expect(s.resolve).toHaveBeenCalledTimes(2));
      if (cause === 'skip') {
        s.session.stop('skipped');
        s.session.start(s.entry as never, 2);
      } else s.player.stop();
      const dispose = vi.fn();
      finish({
        kind: 'readable',
        input: Readable.from([]),
        inputType: 'opus',
        sourceProvider: 'fixture',
        seekable: true,
        dispose,
      });
      await expect(work).rejects.toMatchObject({ code: 'STREAM_CANCELLED' });
      expect(dispose).toHaveBeenCalled();
      s.session.disconnect();
    },
  );
  it('uses validated numeric FFmpeg offsets with managed argument arrays', () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: Readable.from([]),
      stdout: Readable.from([]),
      stderr: Readable.from([]),
      kill: vi.fn(),
    });
    const spawn = vi.fn(() => child);
    const source = {
      kind: 'file' as const,
      input: 'fixture.webm',
      inputType: 'arbitrary' as const,
      sourceProvider: 'fixture',
      seekable: true,
    };
    const prepared = new FFmpegPipeline({ spawn: spawn as never }).prepare(
      source,
      'flat',
      90000,
    );
    expect(spawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-ss', '90', '-i', 'fixture.webm']),
      expect.objectContaining({ shell: false }),
    );
    prepared.dispose();
    expect(child.kill).toHaveBeenCalledOnce();
  });
});
