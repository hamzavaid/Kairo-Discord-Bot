import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { KairoMusicClient } from '../apps/bot/src/services/KairoMusicClient.js';
import { MusicService } from '../apps/bot/src/services/MusicService.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';

const spotifyId = '4wMTgTg3OUc2buJx7clORO';
const sharedPlaylist = `https://open.spotify.com/playlist/${spotifyId}?si=ed093fd4af264add`;
const videoIds = ['abcdefghijk', 'bcdefghijkl'];
const titles = ['First', 'Second'];
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
const song = (index: number) => ({
  id: String.fromCharCode(97 + index).repeat(22),
  name: titles[index] ?? `Song ${index + 1}`,
  duration_ms: index < 2 ? 180000 : 61000 + index,
  artists: [{ name: 'Artist' }],
});
const video = (index: number) => ({
  id: videoIds[index],
  title: titles[index],
  duration: 180000,
  channel: { name: 'Artist' },
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

it.each([
  [
    'Spotify track',
    `https://open.spotify.com/track/${'a'.repeat(22)}?si=share`,
    false,
    true,
  ],
  ['Spotify playlist with share parameters', sharedPlaylist, true, true],
  [
    '12-track Spotify playlist including short songs',
    sharedPlaylist,
    true,
    true,
    12,
  ],
  [
    '12-track Spotify playlist with three unmatched songs',
    sharedPlaylist,
    true,
    true,
    12,
    3,
  ],
  [
    'YouTube video',
    `https://www.youtube.com/watch?v=${videoIds[0]}&si=share`,
    false,
    false,
  ],
  [
    'YouTube short video URL',
    `https://youtu.be/${videoIds[0]}?si=share`,
    false,
    false,
  ],
  [
    'YouTube playlist',
    'https://www.youtube.com/playlist?list=PLabcdefghijk&si=share',
    true,
    false,
  ],
] as const)(
  '/play handles %s through metadata, queue, matching and mocked audio playback',
  async (
    _name,
    input,
    collection,
    spotify,
    playlistSize: number = 2,
    failedTracks: number = 0,
  ) => {
    const fetcher = vi.fn(async (request: string | URL | Request) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith('/token'))
        return json({ access_token: 'fixture-token', expires_in: 3600 });
      if (url.pathname === `/v1/playlists/${spotifyId}`)
        return json({ name: 'Mix' });
      if (url.pathname === `/v1/playlists/${spotifyId}/items`)
        return json({
          items: Array.from({ length: playlistSize }, (_, index) => ({
            item: song(index),
          })),
          total: playlistSize,
          next: null,
        });
      if (url.pathname === `/v1/tracks/${'a'.repeat(22)}`) return json(song(0));
      throw new Error(`Unexpected mocked API path: ${url.pathname}`);
    });
    const search = vi.fn(async (query: string) => {
      const index =
        Array.from({ length: playlistSize }, (_, i) => i).find((i) =>
          query.endsWith(song(i).name!),
        ) ?? 0;
      if (index < failedTracks) return [];
      return [
        {
          ...video(index < 2 ? index : 0),
          title: song(index).name,
          duration: song(index).duration_ms,
        },
      ];
    });
    const getVideo = vi.fn(async () => video(0));
    const getPlaylist = vi.fn(async () => ({
      title: 'Mix',
      videoCount: 2,
      videos: [video(0), video(1)],
    }));
    const children: { kill: ReturnType<typeof vi.fn> }[] = [];
    const spawn = vi.fn((_exe: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        }),
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
        kill: vi.fn(() => true),
      });
      children.push(child);
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
    const voice = Object.assign(new EventEmitter(), {
      subscribe: () => ({ unsubscribe: vi.fn() }),
      destroy: vi.fn(),
    });
    const engine = createKairoMusicEngine({
      spotify: {
        clientId: 'id',
        clientSecret: 'secret',
        fetcher: fetcher as typeof fetch,
      },
      youtubeSr: { search, getVideo, getPlaylist },
      ytDlp: { spawn: spawn as never },
      playbackRuntime: {
        joinVoiceChannel: (() => voice) as never,
        waitVoiceReady: async (v) => v,
        createAudioPlayer: (() => new Player()) as never,
        createAudioResource: ((
          _input: unknown,
          options: { metadata: unknown },
        ) => ({ metadata: options.metadata })) as never,
      },
    });
    try {
      const audit = new AuditLog();
      const handler = createSlashCommandHandler({
        music: new MusicService(new KairoMusicClient(engine)),
        audit,
        settings: {} as never,
        developerIds: new Set(),
      });
      const editReply = vi.fn();
      await handler.execute({
        commandName: 'play',
        user: { id: 'alice' },
        guildId: 'guild',
        guild: {
          voiceAdapterCreator: () => ({}),
          voiceStates: { cache: new Map([['alice', { channelId: 'voice' }]]) },
        },
        options: { getString: () => input },
        deferReply: vi.fn(),
        editReply,
        reply: vi.fn(),
        followUp: vi.fn(),
        deferred: true,
      } as unknown as ChatInputCommandInteraction);
      expect(audit.list(1, 1)[0]).toMatchObject({ success: true });
      await vi.waitFor(() =>
        expect(engine.getPlayback('guild').state).toBe('PLAYING'),
      );
      expect(engine.getPlayback('guild').current?.track.title).toBe(
        song(failedTracks).name,
      );
      expect(
        engine.getQueue('guild').upcoming.map((e) => e.track.title),
      ).toEqual(
        collection
          ? Array.from(
              { length: playlistSize - failedTracks - 1 },
              (_, i) => song(i + failedTracks + 1).name,
            )
          : [],
      );
      expect(search).toHaveBeenCalledTimes(spotify ? failedTracks + 1 : 0);
      expect(
        engine.getQueue('guild').history.map((entry) => entry.track.title),
      ).toEqual(Array.from({ length: failedTracks }, (_, i) => song(i).name));
      if (!spotify) expect(fetcher).not.toHaveBeenCalled();
      if (collection) {
        expect(JSON.stringify(editReply.mock.calls)).toContain(
          `${spotify ? playlistSize : 2} songs`,
        );
        if (spotify)
          expect(
            engine.getQueue('guild').upcoming[0]?.track.sourceProvider,
          ).toBe('spotify');
        await engine.skip('guild');
        await vi.waitFor(() => {
          expect(engine.getPlayback('guild').state).toBe('PLAYING');
          expect(engine.getPlayback('guild').current?.track.title).toBe(
            song(failedTracks + 1).name,
          );
        });
        expect(search).toHaveBeenCalledTimes(spotify ? failedTracks + 2 : 0);
      } else if (!spotify) expect(getVideo).toHaveBeenCalledOnce();
      await engine.disconnectVoice('guild');
      expect(voice.destroy).toHaveBeenCalledOnce();
      expect(children.at(-1)?.kill).toHaveBeenCalledOnce();
    } finally {
      await engine.shutdown();
    }
  },
);
