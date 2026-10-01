import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MongoLibraryRepository } from '@kairo/data';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { LibraryService } from '../apps/bot/src/services/LibraryService.js';
import { MusicService } from '../apps/bot/src/services/MusicService.js';
import { KairoMusicClient } from '../apps/bot/src/services/KairoMusicClient.js';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { libraryModel } from './helpers/libraryModel.js';

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

it('imports canonical tracks, reloads the library, and plays/likes through the existing public pipeline', async () => {
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
    youtubeSr: {
      getPlaylist: async () => ({
        title: 'Imported mix',
        videoCount: 3,
        videos: [
          {
            id: 'abcdefghijk',
            title: 'First',
            duration: 180000,
            channel: { name: 'Artist' },
          },
          null,
          {
            id: 'bcdefghijkl',
            title: 'Second',
            duration: 180000,
            channel: { name: 'Artist' },
          },
        ],
      }),
    },
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
  const music = new MusicService(new KairoMusicClient(engine));
  const { connection } = libraryModel();
  const before = new LibraryService(
    new MongoLibraryRepository(connection),
    music,
  );
  try {
    expect(
      await before.importCollection(
        'alice',
        'Mix',
        'https://www.youtube.com/playlist?list=PLabcdefghijk',
        'guild',
      ),
    ).toMatchObject({ imported: 2, skipped: 1, failed: 0 });
    expect(spawn).not.toHaveBeenCalled();
    expect(engine.getPlayback('guild').state).toBe('DISCONNECTED');
    const after = new LibraryService(
      new MongoLibraryRepository(connection),
      music,
    );
    const audit = new AuditLog();
    const handler = createSlashCommandHandler({
      music,
      library: after,
      audit,
      settings: {} as never,
      developerIds: new Set(),
    });
    const editReply = vi.fn(async (_options: unknown) => {
      void _options;
    });
    const interaction = {
      commandName: 'playlist',
      user: { id: 'alice' },
      guildId: 'guild',
      guild: {
        voiceAdapterCreator: () => ({}),
        voiceStates: { cache: new Map([['alice', { channelId: 'voice' }]]) },
      },
      deferred: false,
      replied: false,
      options: {
        getSubcommand: () => 'play',
        getString: () => 'Mix',
        getInteger: () => null,
      },
      deferReply: async () => {
        interaction.deferred = true;
      },
      editReply,
      reply: vi.fn(),
      followUp: vi.fn(),
    };
    await handler.execute(
      interaction as unknown as ChatInputCommandInteraction,
    );
    await vi.waitFor(() =>
      expect(engine.getPlayback('guild').state).toBe('PLAYING'),
    );
    expect(engine.getQueue('guild').current?.track.title).toBe('First');
    expect(engine.getQueue('guild').upcoming.map((e) => e.track.title)).toEqual(
      ['Second'],
    );
    expect(editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Queued 2 playlist tracks.' }),
    );
    expect(audit.list(1, 1)[0]?.success).toBe(true);
    expect((await after.like('alice', 'guild')).added).toBe(true);
    await engine.skip('guild');
    await vi.waitFor(() =>
      expect(engine.getPlayback('guild').current?.track.title).toBe('Second'),
    );
    await engine.stop('guild');
    await after.playLiked('alice', {
      guildId: 'guild',
      channelId: 'voice',
      adapterCreator: (() => ({})) as never,
    });
    await vi.waitFor(() =>
      expect(engine.getPlayback('guild').state).toBe('PLAYING'),
    );
    expect(engine.getPlayback('guild').current?.track.title).toBe('First');
    expect(
      (await after.get('alice', 'Mix')).entries.map((e) => e.track.title),
    ).toEqual(['First', 'Second']);
    await expect(after.get('bob', 'Mix')).rejects.toMatchObject({
      code: 'PLAYLIST_NOT_FOUND',
    });
    await engine.disconnectVoice('guild');
    expect(voice.destroy).toHaveBeenCalledOnce();
    expect(children.at(-1)?.kill).toHaveBeenCalledOnce();
  } finally {
    await engine.shutdown();
  }
});
