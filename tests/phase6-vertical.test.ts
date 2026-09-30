import { EventEmitter } from 'node:events';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { KairoMusicClient } from '../apps/bot/src/services/KairoMusicClient.js';
import { MusicService } from '../apps/bot/src/services/MusicService.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { createCommandRegistry } from '../apps/bot/src/commands/registry.js';
import { executeSlashCommand } from '../apps/bot/src/commands/slashCommandHandler.js';

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
  pause() {
    const old = this.state;
    this.state = { status: 'paused' };
    this.emit('stateChange', old, this.state);
    return true;
  }
  unpause() {
    const old = this.state;
    this.state = { status: 'playing' };
    this.emit('stateChange', old, this.state);
    return true;
  }
}

function createInteraction(
  name: string,
  options: { query?: string; voiceChannelId?: string } = {},
) {
  let deferred = false;
  let replied = false;
  const deferReply = vi.fn(async () => {
    deferred = true;
  });
  const editReply = vi.fn(async () => {});
  const reply = vi.fn(async () => {
    replied = true;
  });
  const followUp = vi.fn(async () => {});
  const voiceChannelId = options.voiceChannelId;

  const interaction = {
    commandName: name,
    user: { id: 'user' },
    guildId: 'guild',
    guild: {
      voiceAdapterCreator: (() => ({})) as never,
      voiceStates: {
        cache: new Map(
          voiceChannelId
            ? [['user', { channelId: voiceChannelId }]]
            : [],
        ),
      },
    },
    client: { ws: { ping: 10 } },
    createdTimestamp: Date.now(),
    options: {
      getString: (key: string) =>
        key === 'query' ? (options.query ?? null) : null,
      getInteger: () => null,
    },
    memberPermissions: { has: () => false },
    get deferred() {
      return deferred;
    },
    get replied() {
      return replied;
    },
    deferReply,
    editReply,
    reply,
    followUp,
  } as unknown as ChatInputCommandInteraction;

  return { interaction, deferReply, editReply, reply };
}

describe('Phase 6 offline Discord-to-playback slice', () => {
  it('routes a fixture /play to the public engine and starts playback', async () => {
    const connection = Object.assign(new EventEmitter(), {
      state: { status: 'ready' },
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      destroy: vi.fn(),
    });
    const engine = createKairoMusicEngine({
      fixtureTracks: [
        { id: 'demo', title: 'Demo', artists: [{ name: 'Kairo' }] },
      ],
      fixtureAudio: {
        demo: { packets: [Uint8Array.from([0xf8, 0xff, 0xfe])] },
      },
      playbackRuntime: {
        joinVoiceChannel: (() => connection) as never,
        waitVoiceReady: async (value) => value,
        createAudioPlayer: (() => new Player()) as never,
        createAudioResource: ((input: unknown, options: unknown) => ({
          input,
          metadata: (options as { metadata: unknown }).metadata,
        })) as never,
      },
    });
    const music = new MusicService(new KairoMusicClient(engine));
    const audit = new AuditLog();
    const registry = createCommandRegistry(music, audit);

    try {
      const play = createInteraction('play', {
        query: 'https://fixture.kairo.invalid/tracks/demo',
        voiceChannelId: 'voice',
      });
      await executeSlashCommand(
        play.interaction,
        registry.get('play'),
        audit,
        new Set(),
      );

      await vi.waitFor(() =>
        expect(engine.getPlayback('guild').state).toBe('PLAYING'),
      );
      expect(engine.getQueue('guild').current?.track.title).toBe('Demo');
      expect(play.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Playing: Demo' }),
      );
      expect(audit.list(1, 10)[0]?.success).toBe(true);

      const pause = createInteraction('pause', { voiceChannelId: 'voice' });
      await executeSlashCommand(
        pause.interaction,
        registry.get('pause'),
        audit,
        new Set(),
      );
      expect(engine.getPlayback('guild').state).toBe('PAUSED');

      const resume = createInteraction('resume', { voiceChannelId: 'voice' });
      await executeSlashCommand(
        resume.interaction,
        registry.get('resume'),
        audit,
        new Set(),
      );
      expect(engine.getPlayback('guild').state).toBe('PLAYING');

      const disconnect = createInteraction('disconnect');
      await executeSlashCommand(
        disconnect.interaction,
        registry.get('disconnect'),
        audit,
        new Set(),
      );
      expect(engine.getPlayback('guild').state).toBe('DISCONNECTED');
      expect(engine.getQueue('guild').current).toBeUndefined();
      expect(connection.destroy).toHaveBeenCalled();
      expect(disconnect.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Disconnected from voice.' }),
      );
    } finally {
      await engine.shutdown();
    }
  });
});
