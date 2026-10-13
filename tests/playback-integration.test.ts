import { MusicService } from '../apps/bot/src/services/MusicService.js';
import { KairoMusicClient } from '../apps/bot/src/services/KairoMusicClient.js';
import { PlaybackPolicyService } from '../apps/bot/src/services/PlaybackPolicyService.js';
import { PlaybackControlService } from '../apps/bot/src/services/PlaybackControlService.js';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine, type Track } from '@kairo/music-engine';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
} from '@discordjs/voice';

const mocks = vi.hoisted(() => ({
  players: [] as unknown[],
  connections: [] as unknown[],
}));
vi.mock('@discordjs/voice', async () => {
  const { EventEmitter } = await import('node:events');
  class Player extends EventEmitter {
    state: {
      status: string;
      resource?: { metadata?: { generation: number } };
    } = { status: 'idle' };
    plays: unknown[] = [];
    play(resource: unknown) {
      const previous = this.state;
      this.state = {
        status: 'playing',
        resource: resource as { metadata: { generation: number } },
      };
      this.plays.push(resource);
      this.emit('stateChange', previous, this.state);
    }
    pause() {
      const previous = this.state;
      this.state = { ...this.state, status: 'paused' };
      this.emit('stateChange', previous, this.state);
      return true;
    }
    unpause() {
      const previous = this.state;
      this.state = { ...this.state, status: 'playing' };
      this.emit('stateChange', previous, this.state);
      return true;
    }
    stop() {
      const previous = this.state;
      this.state = { status: 'idle' };
      this.emit('stateChange', previous, this.state);
      return true;
    }
  }
  return {
    AudioPlayerStatus: {
      Idle: 'idle',
      Buffering: 'buffering',
      Playing: 'playing',
      Paused: 'paused',
    },
    VoiceConnectionStatus: { Ready: 'ready' },
    StreamType: {
      Opus: 'opus',
      OggOpus: 'ogg/opus',
      WebmOpus: 'webm/opus',
      Raw: 'raw',
      Arbitrary: 'arbitrary',
    },
    NoSubscriberBehavior: { Play: 'play' },
    createAudioPlayer: () => {
      const player = new Player();
      mocks.players.push(player);
      return player;
    },
    createAudioResource: (_input: unknown, options: unknown) => ({
      metadata: (options as { metadata: unknown }).metadata,
    }),
    joinVoiceChannel: () => {
      const connection = Object.assign(new EventEmitter(), {
        state: { status: 'ready' },
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
        destroy: vi.fn(),
      });
      mocks.connections.push(connection);
      return connection;
    },
    entersState: async (connection: unknown) => connection,
  };
});

const guildId = 'guild-playback';
const track = (id: string): Track => ({
  id: `fixture:${id}`,
  sourceId: id,
  sourceProvider: 'fixture',
  title: id,
  artists: [{ name: 'Fixture' }],
  isLive: false,
  requestedBy: 'user',
  provenance: { input: id, parsedBy: 'fixture' },
  createdAt: new Date(),
});
const target = {
  guildId,
  channelId: 'voice-channel',
  adapterCreator: () => ({ sendPayload: () => true, destroy: () => {} }),
};
const packets = [Uint8Array.from([0xf8, 0xff, 0xfe])];
const playbackRuntime = {
  joinVoiceChannel,
  waitVoiceReady: async <T>(connection: T) => connection,
  createAudioPlayer,
  createAudioResource,
};

describe('Phase 5 public playback integration with mocked Discord transport', () => {
  it('plays fixture audio, pauses, resumes, skips, and cleans up voice', async () => {
    const engine = createKairoMusicEngine({
      fixtureAudio: { a: { packets }, b: { packets } },
      playbackRuntime,
    });
    await engine.connectVoice(target);
    await engine.enqueueMany({
      guildId,
      tracks: [track('a'), track('b')],
      enqueuedBy: 'user',
    });
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    const player = mocks.players.at(-1) as { plays: unknown[] };
    expect(player.plays).toHaveLength(1);
    expect((await engine.pause(guildId)).state).toBe('PAUSED');
    expect((await engine.resume(guildId)).state).toBe('PLAYING');
    await engine.skip(guildId);
    await vi.waitFor(() => expect(player.plays).toHaveLength(2));
    expect(engine.getQueue(guildId).current?.track.sourceId).toBe('b');
    await engine.disconnectVoice(guildId);
    expect(engine.getPlayback(guildId).state).toBe('DISCONNECTED');
    expect(
      (mocks.connections.at(-1) as { destroy: ReturnType<typeof vi.fn> })
        .destroy,
    ).toHaveBeenCalledOnce();
    await engine.disconnectVoice(guildId);
    await engine.shutdown();
  });

  it('advances once when skip races the player idle event', async () => {
    const engine = createKairoMusicEngine({
      fixtureAudio: { a: { packets }, b: { packets }, c: { packets } },
      playbackRuntime,
    });
    await engine.connectVoice(target);
    await engine.enqueueMany({
      guildId,
      tracks: [track('a'), track('b'), track('c')],
      enqueuedBy: 'user',
    });
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    const player = mocks.players.at(-1) as {
      plays: unknown[];
      stop: () => void;
    };
    player.stop();
    await engine.skip(guildId);
    await vi.waitFor(() => expect(player.plays).toHaveLength(2));
    expect(engine.getQueue(guildId).current?.track.sourceId).toBe('b');
    await engine.shutdown();
  });

  it('skips a failed fixture source and starts the next entry', async () => {
    const engine = createKairoMusicEngine({
      fixtureAudio: { b: { packets } },
      playbackRuntime,
    });
    await engine.connectVoice(target);
    await engine.enqueueMany({
      guildId,
      tracks: [track('missing'), track('b')],
      enqueuedBy: 'user',
    });
    await vi.waitFor(() =>
      expect(engine.getQueue(guildId).current?.track.sourceId).toBe('b'),
    );
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    await engine.shutdown();
  });
});

it('preserves active audio when previous history is empty and restores history in order', async () => {
  const engine = createKairoMusicEngine({
    fixtureAudio: { a: { packets }, b: { packets } },
    playbackRuntime,
  });
  try {
    await engine.connectVoice(target);
    await engine.enqueueMany({
      guildId,
      tracks: [track('a'), track('b')],
      enqueuedBy: 'user',
    });
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    const before = engine.getPlayback(guildId);
    await expect(engine.previous(guildId)).rejects.toMatchObject({
      code: 'QUEUE_EMPTY',
    });
    expect(engine.getPlayback(guildId)).toEqual(before);
    await engine.skip(guildId);
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    const restored = await engine.previous(guildId);
    expect(restored.current?.track.sourceId).toBe('a');
    expect(restored.upcoming.map((e) => e.track.sourceId)).toEqual(['b']);
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
  } finally {
    await engine.shutdown();
  }
});

it('queues play-next without restarting current audio, then plays it before the FIFO tail', async () => {
  const engine = createKairoMusicEngine({
    fixtureAudio: { a: { packets }, b: { packets }, next: { packets } },
    playbackRuntime,
  });
  try {
    await engine.connectVoice(target);
    const before = await engine.enqueueMany({
      guildId,
      tracks: [track('a'), track('b')],
      enqueuedBy: 'user',
    });
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    const player = mocks.players.at(-1) as { plays: unknown[] };
    const after = await engine.enqueue({
      guildId,
      track: track('next'),
      enqueuedBy: 'user',
      position: 'next',
    });
    expect(after.current?.id).toBe(before.current?.id);
    expect(after.generation).toBe(before.generation);
    expect(player.plays).toHaveLength(1);
    await engine.skip(guildId);
    await vi.waitFor(() => expect(player.plays).toHaveLength(2));
    expect(engine.getPlayback(guildId).current?.track.sourceId).toBe('next');
    expect(
      engine.getQueue(guildId).upcoming.map((e) => e.track.sourceId),
    ).toEqual(['b']);
  } finally {
    await engine.shutdown();
  }
});

it('loads persisted defaults once per connection and reloads them after disconnect', async () => {
  let volume = 42;
  const defaults = vi.fn(async () => ({
    volume,
    filter: 'flat' as const,
    repeat: 'queue' as const,
  }));
  const engine = createKairoMusicEngine({
    playbackRuntime,
    playbackDefaultsForGuild: defaults,
  });
  try {
    await engine.connectVoice(target);
    expect(engine.getPlayback(guildId)).toMatchObject({
      volume: 42,
      filter: 'flat',
    });
    expect(engine.getQueue(guildId).repeatMode).toBe('queue');
    await engine.setVolume(guildId, 20);
    await engine.connectVoice(target);
    expect(defaults).toHaveBeenCalledOnce();
    expect(engine.getPlayback(guildId).volume).toBe(20);
    await engine.disconnectVoice(guildId);
    volume = 60;
    await engine.connectVoice(target);
    expect(defaults).toHaveBeenCalledTimes(2);
    expect(engine.getPlayback(guildId).volume).toBe(60);
  } finally {
    await engine.shutdown();
  }
});

it('does not leave a voice connection when persisted default lookup fails', async () => {
  const before = mocks.connections.length;
  const engine = createKairoMusicEngine({
    playbackRuntime,
    playbackDefaultsForGuild: async () => {
      throw Error('database unavailable');
    },
  });
  try {
    await expect(engine.connectVoice(target)).rejects.toThrow();
    expect(mocks.connections.length).toBe(before);
    expect(engine.getPlayback(guildId).state).toBe('DISCONNECTED');
  } finally {
    await engine.shutdown();
  }
});

it('rejects stale disconnect controls without stopping the newer song', async () => {
  const engine = createKairoMusicEngine({
    fixtureAudio: { a: { packets }, b: { packets } },
    playbackRuntime,
  });
  try {
    await engine.connectVoice(target);
    await engine.enqueueMany({
      guildId,
      tracks: [track('a'), track('b')],
      enqueuedBy: 'user',
    });
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    const generation = engine.getQueue(guildId).generation;
    await engine.skip(guildId, generation);
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    const disconnect = engine.disconnectVoice as (
      id: string,
      generation?: number,
    ) => Promise<unknown>;
    await expect(disconnect(guildId, generation)).rejects.toMatchObject({
      code: 'STALE_PLAYBACK',
    });
    expect(engine.getQueue(guildId).current?.track.sourceId).toBe('b');
    expect(engine.getPlayback(guildId).state).toBe('PLAYING');
  } finally {
    await engine.shutdown();
  }
});

it('admits radio exactly once through the connected queue and gives manual arrivals priority', async () => {
  const engine = createKairoMusicEngine({
    fixtureAudio: { a: { packets }, b: { packets } },
    playbackRuntime,
  });
  try {
    await engine.connectVoice(target);
    const request = {
      guildId,
      track: track('a'),
      enqueuedBy: 'user',
      expectedGeneration: engine.getQueue(guildId).generation,
    };
    expect(
      await Promise.all([
        engine.enqueueAutoplay(request),
        engine.enqueueAutoplay(request),
      ]),
    ).toEqual([true, false]);
    expect(engine.getQueue(guildId).current?.source).toBe('autoplay');
    await engine.stop(guildId);
    const generation = engine.getQueue(guildId).generation;
    await engine.enqueue({ guildId, track: track('b'), enqueuedBy: 'user' });
    expect(
      await engine.enqueueAutoplay({
        ...request,
        expectedGeneration: generation,
      }),
    ).toBe(false);
    expect(engine.getQueue(guildId).current?.track.sourceId).toBe('b');
  } finally {
    await engine.shutdown();
  }
});

it('executes advanced Discord controls through policy, services and the public engine, auditing denied developers safely', async () => {
  const engine = createKairoMusicEngine({
    fixtureAudio: { a: { packets }, b: { packets } },
    playbackRuntime,
  });
  const music = new MusicService(new KairoMusicClient(engine));
  const policy = new PlaybackPolicyService();
  const settings = {
    get: async () => ({
      guildId,
      idleDisconnectSeconds: 60,
      audioQuality: 'high' as const,
      controls: {
        controlPolicy: 'dj' as const,
        djRoleId: '123456789012345678',
      },
    }),
    setIdleDisconnectSeconds: vi.fn(),
    setAudioQuality: vi.fn(),
  };
  const audit = new AuditLog();
  const controls = new PlaybackControlService(music, settings, policy);
  const handler = createSlashCommandHandler({
    music,
    settings,
    policy,
    controls,
    audit,
    developerIds: new Set(['developer']),
  });
  const interaction = (
    name: string,
    userId: string,
    roles: string[],
    voice = 'voice-channel',
  ) => ({
    commandName: name,
    guildId,
    channelId: 'text',
    user: { id: userId },
    guild: {
      members: {
        cache: new Map([
          [userId, { roles: { cache: new Map(roles.map((id) => [id, {}])) } }],
        ]),
      },
      roles: { cache: new Map([['123456789012345678', {}]]) },
      voiceStates: { cache: new Map([[userId, { channelId: voice }]]) },
    },
    memberPermissions: { has: () => false },
    options: {
      getInteger: (key: string) => (key === 'amount' ? 40 : null),
      getString: () => null,
    },
    reply: vi.fn(),
    deferred: false,
    replied: false,
  });
  try {
    await music.playTracks({
      guildId,
      userId: 'user',
      voiceTarget: target,
      tracks: [track('a'), track('b')],
    });
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
    const denied = interaction('volume', 'developer', []);
    await handler.execute(denied as never);
    expect(engine.getPlayback(guildId).volume).toBe(100);
    expect(denied.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('DJ') }),
    );
    const dj = interaction('volume', 'dj', ['123456789012345678']);
    await handler.execute(dj as never);
    expect(engine.getPlayback(guildId).volume).toBe(40);
    await handler.execute(
      interaction('skip', 'dj', ['123456789012345678'], 'other-voice') as never,
    );
    expect(engine.getQueue(guildId).current?.track.sourceId).toBe('a');
    await handler.execute(
      interaction('skip', 'dj', ['123456789012345678']) as never,
    );
    expect(engine.getQueue(guildId).current?.track.sourceId).toBe('b');
    expect(audit.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'developer',
          success: false,
          errorCode: 'DJ_PERMISSION_REQUIRED',
        }),
        expect.objectContaining({
          userId: 'dj',
          success: true,
          command: 'volume',
        }),
        expect.objectContaining({
          success: false,
          errorCode: 'WRONG_VOICE_CHANNEL',
        }),
      ]),
    );
  } finally {
    await engine.shutdown();
  }
});

it('isolates bounded trivia previews from normal queues, snapshots and listening history', async () => {
  const engine = createKairoMusicEngine({
    fixtureAudio: { secret: { packets } },
    playbackRuntime,
  });
  const events: unknown[] = [];
  engine.on('playbackAttempt', (e) => events.push(e));
  try {
    const lease = await engine.acquirePreview(target, 'game');
    await expect(
      engine.enqueue({ guildId, track: track('secret'), enqueuedBy: 'user' }),
    ).rejects.toMatchObject({ code: 'PLAYBACK_OWNED' });
    await engine.playPreview({
      guildId,
      leaseId: lease.leaseId,
      track: track('secret'),
      durationMs: 1000,
    });
    expect(engine.getQueue(guildId).current).toBeUndefined();
    expect(JSON.stringify(engine.getPlayback(guildId))).not.toContain('secret');
    expect(events).toEqual([]);
    await engine.stopPreview(guildId, lease.leaseId);
    await engine.releasePreview(guildId, lease.leaseId);
    expect(engine.getPlayback(guildId).state).toBe('DISCONNECTED');
    await engine.releasePreview(guildId, lease.leaseId);
  } finally {
    await engine.shutdown();
  }
});
it('refuses trivia over existing music and restores an original idle connection after previews', async () => {
  const engine = createKairoMusicEngine({
    fixtureAudio: { a: { packets } },
    playbackRuntime,
  });
  try {
    await engine.connectVoice(target);
    await engine.setVolume(guildId, 25);
    await engine.enqueue({ guildId, track: track('a'), enqueuedBy: 'user' });
    await expect(engine.acquirePreview(target, 'game')).rejects.toMatchObject({
      code: 'PLAYBACK_OWNED',
    });
    await engine.stop(guildId);
    const lease = await engine.acquirePreview(target, 'game');
    await engine.playPreview({
      guildId,
      leaseId: lease.leaseId,
      track: track('a'),
      durationMs: 1000,
    });
    await engine.releasePreview(guildId, lease.leaseId);
    expect(engine.getPlayback(guildId)).toMatchObject({
      state: 'IDLE',
      volume: 25,
    });
    await engine.enqueue({ guildId, track: track('a'), enqueuedBy: 'user' });
    await vi.waitFor(() =>
      expect(engine.getPlayback(guildId).state).toBe('PLAYING'),
    );
  } finally {
    await engine.shutdown();
  }
});
