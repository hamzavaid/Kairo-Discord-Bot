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
