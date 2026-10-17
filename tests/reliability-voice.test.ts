import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { VoiceConnectionDisconnectReason as Reason } from '@discordjs/voice';
import { VoiceManager } from '../packages/music-engine/src/playback/VoiceManager.js';

const target = {
  guildId: 'g',
  channelId: 'v',
  adapterCreator: (() => ({})) as never,
};
function connection() {
  return Object.assign(new EventEmitter(), {
    state: { status: 'ready' },
    rejoin: vi.fn(() => true),
    destroy: vi.fn(),
  });
}
it('recovers transient voice loss on the same connection once despite duplicate events', async () => {
  const voice = connection(),
    onRecovery = vi.fn(),
    onDisconnect = vi.fn();
  let ready!: () => void;
  const waitReady = vi
    .fn()
    .mockImplementationOnce(async (v) => v)
    .mockImplementation(
      () =>
        new Promise((done) => {
          ready = () => done(voice);
        }),
    );
  const join = vi.fn(() => voice as never);
  const manager = new VoiceManager({
    join,
    waitReady,
    onRecovery,
    onDisconnect,
    retryDelayMs: 0,
  });
  await manager.connect(target);
  const lost = {
    status: 'disconnected',
    reason: Reason.WebSocketClose,
    closeCode: 1006,
  };
  voice.emit('stateChange', voice.state, lost);
  voice.emit('stateChange', voice.state, lost);
  await vi.waitFor(() => expect(voice.rejoin).toHaveBeenCalledTimes(1));
  ready();
  await vi.waitFor(() =>
    expect(onRecovery).toHaveBeenCalledWith('g', 'recovered'),
  );
  expect(manager.get('g')).toBe(voice);
  expect(join).toHaveBeenCalledTimes(1);
  expect(onDisconnect).not.toHaveBeenCalled();
  await manager.shutdown();
});
it('bounds failed reconnects and never retries server removal', async () => {
  const voice = connection(),
    disconnected = vi.fn();
  const manager = new VoiceManager({
    join: () => voice as never,
    waitReady: vi
      .fn()
      .mockResolvedValueOnce(voice)
      .mockRejectedValue(new Error('network')),
    onDisconnect: disconnected,
    retryDelayMs: 0,
    recoveryAttempts: 2,
  });
  await manager.connect(target);
  voice.emit('stateChange', voice.state, {
    status: 'disconnected',
    reason: Reason.WebSocketClose,
    closeCode: 1006,
  });
  await vi.waitFor(() => expect(disconnected).toHaveBeenCalledTimes(1));
  expect(voice.rejoin).toHaveBeenCalledTimes(2);
  expect(manager.get('g')).toBeUndefined();
  const removed = connection();
  const terminal = new VoiceManager({
    join: () => removed as never,
    waitReady: async (v) => v,
  });
  await terminal.connect(target);
  removed.emit('stateChange', removed.state, {
    status: 'disconnected',
    reason: Reason.WebSocketClose,
    closeCode: 4014,
  });
  expect(terminal.get('g')).toBeUndefined();
  expect(removed.rejoin).not.toHaveBeenCalled();
});
it('disconnect cancels recovery and shutdown cancels a stalled connection join', async () => {
  const voice = connection();
  const manager = new VoiceManager({
    join: () => voice as never,
    waitReady: () => new Promise(() => {}),
    timeoutMs: 50,
  });
  const join = manager.connect(target);
  const failed = expect(join).rejects.toMatchObject({
    code: 'VOICE_JOIN_ERROR',
  });
  await manager.shutdown();
  await failed;
  expect(voice.destroy).toHaveBeenCalledTimes(1);
  expect(manager.get('g')).toBeUndefined();
});
