import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { KairoMusicClient } from '../apps/bot/src/services/KairoMusicClient.js';
import { MusicService } from '../apps/bot/src/services/MusicService.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { createCommandRegistry } from '../apps/bot/src/commands/registry.js';
import { InteractionRouter } from '../apps/bot/src/commands/InteractionRouter.js';

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
    const router = new InteractionRouter(
      createCommandRegistry(music, audit),
      audit,
      new Set(),
    );
    const respond = vi.fn(async () => {});
    try {
      await router.execute({
        name: 'play',
        guildId: 'guild',
        userId: 'user',
        voiceChannelId: 'voice',
        voiceTarget: {
          guildId: 'guild',
          channelId: 'voice',
          adapterCreator: (() => ({})) as never,
        },
        query: 'https://fixture.kairo.invalid/tracks/demo',
        createdTimestamp: Date.now(),
        defer: async () => {},
        respond,
      });
      await vi.waitFor(() =>
        expect(engine.getPlayback('guild').state).toBe('PLAYING'),
      );
      expect(engine.getQueue('guild').current?.track.title).toBe('Demo');
      expect(respond).toHaveBeenCalledWith('Playing: Demo', false);
      expect(audit.list(1, 10)[0]?.success).toBe(true);
      await router.execute({
        name: 'pause',
        guildId: 'guild',
        userId: 'user',
        voiceChannelId: 'voice',
        createdTimestamp: Date.now(),
        defer: async () => {},
        respond,
      });
      expect(engine.getPlayback('guild').state).toBe('PAUSED');
      await router.execute({
        name: 'resume',
        guildId: 'guild',
        userId: 'user',
        voiceChannelId: 'voice',
        createdTimestamp: Date.now(),
        defer: async () => {},
        respond,
      });
      expect(engine.getPlayback('guild').state).toBe('PLAYING');
    } finally {
      await engine.shutdown();
    }
  });
});
