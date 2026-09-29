import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceIdleManager } from '../apps/bot/src/voice/VoiceIdleManager.js';

describe('empty voice channel timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const state = { channelId: 'voice' as string | undefined, humanCount: 1 };
    const settings = {
      get: vi.fn(async () => ({ idleDisconnectSeconds: 60 })),
    };
    const disconnect = vi.fn(async () => {
      state.channelId = undefined;
    });
    const manager = new VoiceIdleManager(
      settings,
      () => ({ ...state }),
      disconnect,
    );
    return { state, settings, disconnect, manager };
  }

  it('disconnects once after 60 continuous seconds with no humans', async () => {
    const { state, disconnect, manager } = setup();
    state.humanCount = 0;
    await manager.refresh('guild');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels when a human returns and restarts when the channel empties again', async () => {
    const { state, disconnect, manager } = setup();
    state.humanCount = 0;
    await manager.refresh('guild');
    await vi.advanceTimersByTimeAsync(30_000);
    state.humanCount = 1;
    await manager.refresh('guild');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(disconnect).not.toHaveBeenCalled();
    state.humanCount = 0;
    await manager.refresh('guild');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('uses each guild setting and allows zero to disable the timeout', async () => {
    const { state, settings, disconnect, manager } = setup();
    state.humanCount = 0;
    settings.get.mockResolvedValue({ idleDisconnectSeconds: 120 });
    await manager.refresh('guild-a');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(disconnect).not.toHaveBeenCalled();
    settings.get.mockResolvedValue({ idleDisconnectSeconds: 0 });
    await manager.refresh('guild-a');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('cancels a pending timer on manual bot disconnect and never reconnects', async () => {
    const { state, disconnect, manager } = setup();
    state.humanCount = 0;
    await manager.refresh('guild');
    state.channelId = undefined;
    await manager.refresh('guild');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(disconnect).not.toHaveBeenCalled();
  });
});
