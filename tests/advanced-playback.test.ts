import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { PlaybackSession } from '../packages/music-engine/src/playback/PlaybackSession.js';
import { FFmpegPipeline } from '../packages/music-engine/src/stream/FFmpegPipeline.js';
import { FILTER_GRAPHS } from '../packages/music-engine/src/playback/PlaybackControls.js';

describe('advanced playback controls', () => {
  it('rejects invalid public volume/filter settings and isolates sessions', async () => {
    const engine = createKairoMusicEngine();
    for (const value of [-1, 101, 0.5, NaN])
      await expect(engine.setVolume('a', value)).rejects.toMatchObject({
        code: 'INVALID_VOLUME',
      });
    await expect(
      engine.setFilter('a', 'unsafe' as never),
    ).rejects.toMatchObject({ code: 'UNKNOWN_FILTER' });
    await engine.setVolume('a', 20);
    await engine.setFilter('a', 'bassboost');
    expect(engine.getPlayback('a')).toMatchObject({
      volume: 20,
      filter: 'bassboost',
    });
    expect(engine.getPlayback('b')).toMatchObject({
      volume: 100,
      filter: 'flat',
    });
    await engine.shutdown();
  });
  it('applies realtime volume without replacing queue/resource and clamps no values silently', async () => {
    const setVolume = vi.fn();
    const resource = { metadata: { generation: 1 }, volume: { setVolume } };
    const player = Object.assign(new EventEmitter(), {
      play: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
    });
    const session = new PlaybackSession({
      guildId: 'a',
      player: player as never,
      resolver: {
        resolve: async () => ({
          kind: 'readable',
          input: Readable.from([]),
          inputType: 'opus',
          sourceProvider: 'fixture',
          seekable: false,
        }),
      },
      createResource: (() => resource) as never,
    });
    session.attach({ subscribe: () => ({ unsubscribe() {} }) } as never);
    session.start(
      {
        id: 'entry',
        enqueuedBy: 'u',
        enqueuedAt: new Date(),
        track: {
          id: 'fixture:a',
          title: 'a',
          artists: [],
          sourceProvider: 'fixture',
          sourceId: 'a',
          requestedBy: 'u',
          createdAt: new Date(),
          isLive: false,
          provenance: { input: 'a', parsedBy: 'fixture' },
        },
      },
      1,
    );
    await vi.waitFor(() => expect(player.play).toHaveBeenCalledOnce());
    session.setVolume(35);
    expect(setVolume).toHaveBeenLastCalledWith(0.35);
    expect(player.play).toHaveBeenCalledOnce();
    session.disconnect();
  });
  it('uses only trusted filter graphs and cleans up converted Opus sources', () => {
    for (const preset of Object.keys(FILTER_GRAPHS).filter(
      (p) => p !== 'flat',
    )) {
      const kill = vi.fn();
      const child = Object.assign(new EventEmitter(), {
        stdin: new Writable({
          write(_c, _e, cb) {
            cb();
          },
        }),
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
        kill,
      });
      const spawn = vi.fn(() => child as never);
      const pipeline = new FFmpegPipeline({ spawn });
      const prepared = pipeline.prepare(
        {
          kind: 'file',
          input: 'fixture.webm',
          inputType: 'webm/opus',
          sourceProvider: 'fixture',
          seekable: false,
        },
        preset as keyof typeof FILTER_GRAPHS,
      );
      expect(spawn.mock.calls[0]).toEqual([
        'ffmpeg',
        expect.arrayContaining([
          '-af',
          FILTER_GRAPHS[preset as keyof typeof FILTER_GRAPHS],
        ]),
        expect.objectContaining({ shell: false }),
      ]);
      prepared.dispose();
      prepared.dispose();
      expect(kill).toHaveBeenCalledOnce();
    }
  });
});
