import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { VoiceConnectionDisconnectReason as Reason } from '@discordjs/voice';
import { createKairoMusicEngine, type Track } from '@kairo/music-engine';

class Player extends EventEmitter {
  state: { status: string; resource?: { metadata: unknown } } = {
    status: 'idle',
  };
  plays = 0;
  set(status: string, resource = this.state.resource) {
    const old = this.state;
    this.state = { status, ...(resource ? { resource } : {}) };
    this.emit('stateChange', old, this.state);
  }
  play(resource: { metadata: unknown }) {
    this.plays++;
    this.set('playing', resource);
  }
  pause() {
    this.set('paused');
    return true;
  }
  unpause() {
    this.set('playing');
    return true;
  }
  stop() {
    this.set('idle');
    return true;
  }
}
function setup(waitReady = async <T>(v: T) => v) {
  const player = new Player();
  const connection = Object.assign(new EventEmitter(), {
    state: { status: 'ready' },
    rejoin: vi.fn(() => true),
    subscribe: () => ({ unsubscribe: vi.fn() }),
    destroy: vi.fn(),
  });
  const engine = createKairoMusicEngine({
    fixtureAudio: {
      a: { packets: [Uint8Array.from([0xf8, 0xff, 0xfe])] },
      b: { packets: [Uint8Array.from([0xf8, 0xff, 0xfe])] },
    },
    playbackRuntime: {
      joinVoiceChannel: (() => connection) as never,
      waitVoiceReady: waitReady,
      createAudioPlayer: (() => player) as never,
      createAudioResource: ((
        _input: unknown,
        options: { metadata: unknown },
      ) => ({ metadata: options.metadata })) as never,
    },
    reliability: { watchdogIntervalMs: 20, stuckSessionMs: 10 },
  });
  const target = {
    guildId: 'g',
    channelId: 'v',
    adapterCreator: (() => ({})) as never,
  };
  const track = (id: string): Track => ({
    id,
    sourceId: id,
    sourceProvider: 'fixture',
    title: id,
    artists: [{ name: 'Fixture' }],
    isLive: false,
    requestedBy: 'u',
    createdAt: new Date(),
    provenance: { input: id, parsedBy: 'fixture' },
  });
  return { player, connection, engine, target, track };
}
it('recovers the existing paused resource without replaying or changing the queue', async () => {
  const { engine, player, connection, target, track } = setup();
  await engine.connectVoice(target);
  await engine.enqueueMany({
    guildId: 'g',
    tracks: [track('a'), track('b')],
    enqueuedBy: 'u',
  });
  await vi.waitFor(() => expect(engine.getPlayback('g').state).toBe('PLAYING'));
  await engine.pause('g');
  const queue = engine.getQueue('g');
  connection.emit('stateChange', connection.state, {
    status: 'disconnected',
    reason: Reason.WebSocketClose,
    closeCode: 1006,
  });
  await vi.waitFor(() => expect(connection.rejoin).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setImmediate(resolve));
  expect(engine.getPlayback('g').state).toBe('PAUSED');
  expect(engine.getQueue('g')).toEqual(queue);
  expect(player.plays).toBe(1);
  await engine.shutdown();
  expect(connection.destroy).toHaveBeenCalledTimes(1);
  expect(engine.getHealth().resources.activeVoiceSessions).toBe(0);
});
it('stop cancels a stalled voice join before it can attach or start playback', async () => {
  let finish!: (v: never) => void;
  const { engine, player, connection, target } = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve as never;
      }),
  );
  const job = engine.connectVoice(target);
  const failed = expect(job).rejects.toMatchObject({
    code: 'VOICE_JOIN_ERROR',
  });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await engine.stop('g');
  await failed;
  finish(connection as never);
  expect(player.plays).toBe(0);
  expect(engine.getPlayback('g').state).toBe('DISCONNECTED');
  expect(connection.destroy).toHaveBeenCalledTimes(1);
  await engine.shutdown();
});
it('shutdown during playing is idempotent and rejects late admissions', async () => {
  const { engine, player, connection, target, track } = setup();
  await engine.connectVoice(target);
  await engine.enqueue({ guildId: 'g', track: track('a'), enqueuedBy: 'u' });
  await vi.waitFor(() => expect(player.plays).toBe(1));
  expect(
    engine.getHealth().metrics.find((m) => m.name === 'queue_depth')?.value,
  ).toBe(1);
  await Promise.all([engine.shutdown(), engine.shutdown()]);
  expect(
    engine.getHealth().metrics.find((m) => m.name === 'queue_depth')?.value,
  ).toBe(0);
  await expect(
    engine.enqueue({ guildId: 'g', track: track('b'), enqueuedBy: 'u' }),
  ).rejects.toMatchObject({ code: 'STREAM_CANCELLED' });
  expect(connection.destroy).toHaveBeenCalledTimes(1);
  expect(engine.getHealth().status).toBe('closed');
});
