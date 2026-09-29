import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { VoiceManager } from '../packages/music-engine/src/playback/VoiceManager.js';
import { PlaybackSession } from '../packages/music-engine/src/playback/PlaybackSession.js';
import type { Track } from '@kairo/music-engine';

const track: Track = {
  id: 'fixture:slow',
  sourceId: 'slow',
  sourceProvider: 'fixture',
  title: 'Slow',
  artists: [{ name: 'Fixture' }],
  isLive: false,
  requestedBy: 'user',
  provenance: { input: 'slow', parsedBy: 'fixture' },
  createdAt: new Date(),
};
const entry = {
  id: 'entry-1',
  track,
  enqueuedBy: 'user',
  enqueuedAt: new Date(),
};

describe('Phase 5 voice and session cleanup', () => {
  it('connects once per guild and destroys the connection idempotently', async () => {
    const connection = Object.assign(new EventEmitter(), {
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      destroy: vi.fn(),
      state: { status: 'ready' },
    });
    const join = vi.fn(() => connection as never);
    const manager = new VoiceManager({
      join,
      waitReady: async (value) => value,
    });
    const target = {
      guildId: 'guild',
      channelId: 'channel',
      adapterCreator: () => ({ sendPayload: () => true, destroy: () => {} }),
    };
    expect(await manager.connect(target)).toBe(connection);
    expect(await manager.connect(target)).toBe(connection);
    expect(join).toHaveBeenCalledTimes(1);
    await manager.disconnect('guild');
    await manager.disconnect('guild');
    expect(connection.destroy).toHaveBeenCalledTimes(1);
  });

  it('releases a connection after a spontaneous voice disconnect', async () => {
    const connection = Object.assign(new EventEmitter(), {
      subscribe: vi.fn(),
      destroy: vi.fn(),
      state: { status: VoiceConnectionStatus.Ready },
    });
    const onDisconnect = vi.fn();
    const manager = new VoiceManager({
      join: () => connection as never,
      waitReady: async (value) => value,
      onDisconnect,
    });
    await manager.connect({
      guildId: 'guild',
      channelId: 'channel',
      adapterCreator: () => ({ sendPayload: () => true, destroy: () => {} }),
    });
    connection.emit(
      'stateChange',
      { status: VoiceConnectionStatus.Ready },
      { status: VoiceConnectionStatus.Disconnected },
    );
    expect(manager.get('guild')).toBeUndefined();
    expect(connection.destroy).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith('guild');
  });

  it('aborts pending resolution on stop and ignores its late completion', async () => {
    let observed: AbortSignal | undefined;
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>((done) => {
      resolve = done;
    });
    const resolver = {
      resolve: vi.fn((_track: Track, signal: AbortSignal) => {
        observed = signal;
        return pending;
      }),
    };
    const player = Object.assign(new EventEmitter(), {
      play: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
    });
    const connection = {
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      destroy: vi.fn(),
    };
    const session = new PlaybackSession({
      guildId: 'guild',
      resolver: resolver as never,
      player: player as never,
      prepare: vi.fn(),
    });
    session.attach(connection as never);
    session.start(entry, 1);
    expect(session.snapshot().state).toBe('RESOLVING');
    session.stop();
    expect(observed?.aborted).toBe(true);
    resolve({
      kind: 'readable',
      inputType: 'opus',
      input: null,
      sourceProvider: 'fixture',
      seekable: false,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(player.play).not.toHaveBeenCalled();
    expect(session.snapshot().state).toBe('IDLE');
    session.disconnect();
    session.disconnect();
    expect(session.snapshot().state).toBe('DISCONNECTED');
  });

  it('disposes prepared audio on stop and disconnect exactly once', async () => {
    const dispose = vi.fn();
    const resolver = {
      resolve: vi.fn(async () => ({
        kind: 'readable',
        inputType: 'opus',
        input: null,
        sourceProvider: 'fixture',
        seekable: false,
      })),
    };
    const player = Object.assign(new EventEmitter(), {
      play: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
    });
    const session = new PlaybackSession({
      guildId: 'guild',
      resolver: resolver as never,
      player: player as never,
      prepare: () => ({ input: null as never, inputType: 'opus', dispose }),
      createResource: ((_input: unknown, options: { metadata: unknown }) => ({
        metadata: options.metadata,
      })) as never,
    });
    session.attach({ subscribe: () => ({ unsubscribe: vi.fn() }) } as never);
    session.start(entry, 1);
    await vi.waitFor(() => expect(player.play).toHaveBeenCalledOnce());
    session.stop();
    session.disconnect();
    session.disconnect();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('times out buffering and disposes its prepared stream', async () => {
    const dispose = vi.fn();
    const ended = vi.fn();
    const resolver = {
      resolve: vi.fn(async () => ({
        kind: 'readable',
        inputType: 'opus',
        input: null,
        sourceProvider: 'fixture',
        seekable: false,
      })),
    };
    const player = Object.assign(new EventEmitter(), {
      play: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
    });
    const session = new PlaybackSession({
      guildId: 'guild',
      resolver: resolver as never,
      player: player as never,
      prepare: () => ({ input: null as never, inputType: 'opus', dispose }),
      createResource: ((_input: unknown, options: { metadata: unknown }) => ({
        metadata: options.metadata,
      })) as never,
      bufferTimeoutMs: 10,
      onEnded: ended,
    });
    session.attach({ subscribe: () => ({ unsubscribe: vi.fn() }) } as never);
    session.start(entry, 1);
    await vi.waitFor(() =>
      expect(ended).toHaveBeenCalledWith(1, 'stream-failed'),
    );
    expect(dispose).toHaveBeenCalledOnce();
    expect(session.snapshot().state).toBe('IDLE');
  });

  it('reads guild quality at track start and passes it to stream resolution', async () => {
    const resolver = {
      resolve: vi.fn(async () => ({
        kind: 'readable',
        input: null,
        inputType: 'opus',
        sourceProvider: 'fixture',
        seekable: false,
      })),
    };
    const player = Object.assign(new EventEmitter(), {
      play: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
    });
    const quality = vi.fn(async () => 'best' as const);
    const session = new PlaybackSession({
      guildId: 'guild',
      resolver: resolver as never,
      player: player as never,
      audioQualityForGuild: quality,
      prepare: () => ({
        input: null as never,
        inputType: 'opus',
        dispose: vi.fn(),
      }),
      createResource: ((_input: unknown, options: { metadata: unknown }) => ({
        metadata: options.metadata,
      })) as never,
    });
    session.attach({ subscribe: () => ({ unsubscribe: vi.fn() }) } as never);
    session.start(entry, 1);
    await vi.waitFor(() => expect(resolver.resolve).toHaveBeenCalled());
    expect(quality).toHaveBeenCalledWith('guild', expect.any(AbortSignal));
    expect(resolver.resolve).toHaveBeenCalledWith(
      track,
      expect.any(AbortSignal),
      { guildId: 'guild', audioQuality: 'best' },
    );
    session.disconnect();
  });
});
