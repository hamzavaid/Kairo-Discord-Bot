import { describe, expect, it, vi } from 'vitest';
import type { KairoMusicEngine } from '@kairo/music-engine';
import { KairoMusicClient } from '../apps/bot/src/services/KairoMusicClient.js';

describe('bot music adapter', () => {
  it('forwards Discord-derived context through the engine public API', async () => {
    const parse = vi.fn().mockResolvedValue({ kind: 'search', candidates: [] });
    const engine = {
      parse,
      matchCandidates: vi.fn(),
      enqueue: vi.fn(),
      enqueueMany: vi.fn(),
      getQueue: vi.fn(),
      skip: vi.fn(),
      stop: vi.fn(),
      clear: vi.fn(),
      remove: vi.fn(),
      move: vi.fn(),
      shuffle: vi.fn(),
      setRepeat: vi.fn(),
      previous: vi.fn(),
      connectVoice: vi.fn(),
      disconnectVoice: vi.fn(),
      getPlayback: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      on: vi.fn(),
      shutdown: vi.fn(),
    } satisfies KairoMusicEngine;
    const client = new KairoMusicClient(engine);
    await client.parse('Night Drive', 'guild-1', 'user-1');
    expect(parse).toHaveBeenCalledWith({
      input: 'Night Drive',
      guildId: 'guild-1',
      requestedBy: 'user-1',
    });
  });
});
