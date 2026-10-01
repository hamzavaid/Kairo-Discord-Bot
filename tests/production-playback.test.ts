import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine, type Track } from '@kairo/music-engine';

const videoId = 'dQw4w9WgXcQ';
const source = (provider: 'spotify' | 'musicbrainz'): Track => ({
  id: `${provider}:recording`,
  sourceId: 'recording',
  sourceProvider: provider,
  title: 'Example Song',
  artists: [{ name: 'Example Artist' }],
  durationMs: 180_000,
  isLive: false,
  requestedBy: 'user',
  createdAt: new Date('2026-01-01'),
  provenance: { input: 'Example Song', parsedBy: provider },
});

class Player extends EventEmitter {
  state = { status: 'idle' };
  play() {
    const old = this.state;
    this.state = { status: 'playing' };
    this.emit('stateChange', old, this.state);
  }
  stop() {
    const old = this.state;
    this.state = { status: 'idle' };
    this.emit('stateChange', old, this.state);
    return true;
  }
}

function processFixture() {
  return Object.assign(new EventEmitter(), {
    stdin: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    stdout: new Readable({ read() {} }),
    stderr: new Readable({ read() {} }),
    kill: vi.fn(() => true),
  });
}

describe('production source path through public engine', () => {
  it('prepares only the active catalog track in an ordered enqueueMany sequence', async () => {
    const search = vi.fn(async () => [
      {
        id: videoId,
        title: 'Example Song',
        duration: 180000,
        channel: { name: 'Example Artist' },
      },
    ]);
    const spawn = vi.fn((_exe: string, args: string[]) => {
      const child = processFixture();
      if (args.includes('--dump-single-json'))
        queueMicrotask(() => {
          child.stdout.emit(
            'data',
            Buffer.from(
              JSON.stringify({
                formats: [
                  {
                    format_id: 'opus',
                    ext: 'webm',
                    acodec: 'opus',
                    vcodec: 'none',
                    abr: 160,
                  },
                ],
              }),
            ),
          );
          child.emit('close', 0);
        });
      return child as never;
    });
    const connection = Object.assign(new EventEmitter(), {
      subscribe: () => ({ unsubscribe: vi.fn() }),
      destroy: vi.fn(),
    });
    const engine = createKairoMusicEngine({
      youtubeSr: { search },
      ytDlp: { spawn: spawn as never },
      playbackRuntime: {
        joinVoiceChannel: (() => connection) as never,
        waitVoiceReady: async (v) => v,
        createAudioPlayer: (() => new Player()) as never,
        createAudioResource: ((
          _input: unknown,
          options: { metadata: unknown },
        ) => ({ metadata: options.metadata })) as never,
      },
    });
    try {
      await engine.connectVoice({
        guildId: 'guild',
        channelId: 'voice',
        adapterCreator: (() => ({})) as never,
      });
      await engine.enqueueMany({
        guildId: 'guild',
        enqueuedBy: 'user',
        tracks: [source('spotify'), source('musicbrainz')],
      });
      await vi.waitFor(() =>
        expect(engine.getPlayback('guild').state).toBe('PLAYING'),
      );
      expect(search).toHaveBeenCalledOnce();
      expect(engine.getQueue('guild').upcoming[0]?.track.sourceProvider).toBe(
        'musicbrainz',
      );
      await engine.skip('guild');
      await vi.waitFor(() =>
        expect(engine.getPlayback('guild').state).toBe('PLAYING'),
      );
      expect(search).toHaveBeenCalledTimes(2);
    } finally {
      await engine.shutdown();
    }
  });
  for (const provider of ['spotify', 'musicbrainz'] as const) {
    for (const action of ['skip', 'stop', 'disconnect', 'shutdown'] as const) {
      it(`${provider} matches YouTube, streams at guild quality, and cleans up on ${action}`, async () => {
        const children: ReturnType<typeof processFixture>[] = [];
        const spawn = vi.fn((_file: string, args: string[]) => {
          const child = processFixture();
          children.push(child);
          if (args.includes('--dump-single-json'))
            queueMicrotask(() => {
              child.stdout.emit(
                'data',
                Buffer.from(
                  JSON.stringify({
                    formats: [
                      {
                        format_id: 'low',
                        ext: 'webm',
                        acodec: 'opus',
                        vcodec: 'none',
                        abr: 48,
                      },
                      {
                        format_id: 'high',
                        ext: 'webm',
                        acodec: 'opus',
                        vcodec: 'none',
                        abr: 160,
                      },
                    ],
                  }),
                ),
              );
              child.emit('close', 0);
            });
          return child as never;
        });
        const connection = Object.assign(new EventEmitter(), {
          subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
          destroy: vi.fn(),
        });
        const quality = vi.fn(async () => 'low' as const);
        const engine = createKairoMusicEngine({
          youtubeSr: {
            search: async () => [
              {
                id: videoId,
                title: 'Example Song (Official Audio)',
                duration: 180_000,
                channel: { name: 'Example Artist - Topic' },
              },
            ],
          },
          ytDlp: { spawn: spawn as never },
          audioQualityForGuild: quality,
          playbackRuntime: {
            joinVoiceChannel: (() => connection) as never,
            waitVoiceReady: async (value) => value,
            createAudioPlayer: (() => new Player()) as never,
            createAudioResource: ((
              _input: unknown,
              options: { metadata: unknown },
            ) => ({ metadata: options.metadata })) as never,
          },
        });
        const selectedSource = vi.fn();
        engine.on('playbackSourceSelected', selectedSource);
        try {
          const playable = await engine.preparePlayable(source(provider));
          expect(playable.provenance.originalSourceProvider).toBe(provider);
          expect(engine.canPlay(playable)).toBe(true);
          await engine.connectVoice({
            guildId: 'guild',
            channelId: 'voice',
            adapterCreator: (() => ({})) as never,
          });
          await engine.enqueue({
            guildId: 'guild',
            track: playable,
            enqueuedBy: 'user',
          });
          await vi.waitFor(() =>
            expect(engine.getPlayback('guild').state).toBe('PLAYING'),
          );
          expect(selectedSource).toHaveBeenCalledWith(
            expect.objectContaining({
              metadataProvider: provider,
              candidateSearchProvider: 'youtube-sr',
              selectedCandidateId: videoId,
              streamProvider: 'yt-dlp',
              audioQuality: 'low',
            }),
          );
          expect(quality).toHaveBeenCalledWith(
            'guild',
            expect.any(AbortSignal),
          );
          expect(
            spawn.mock.calls.find((call) => call[1].includes('--format'))?.[1],
          ).toEqual(expect.arrayContaining(['--format', 'low']));
          if (action === 'skip') await engine.skip('guild');
          else if (action === 'stop') await engine.stop('guild');
          else if (action === 'disconnect')
            await engine.disconnectVoice('guild');
          else await engine.shutdown();
          expect(children.at(-1)?.kill).toHaveBeenCalledOnce();
        } finally {
          await engine.shutdown();
        }
      });
    }
  }
});
