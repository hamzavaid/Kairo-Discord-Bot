import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';

const context = {
  guildId: 'guild-1',
  requestedBy: 'user-1',
  requestId: 'req-1',
};

describe('Phase 1 parser contract', () => {
  it('validates provider payloads before returning canonical tracks', async () => {
    const engine = createKairoMusicEngine({
      fixtureTracks: [{ id: 'invalid', title: '', artists: [] }],
    });
    await expect(
      engine.parse({
        ...context,
        input: 'https://fixture.kairo.invalid/tracks/invalid',
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_PARSE_ERROR',
      retryable: false,
      correlationId: 'req-1',
    });
  });

  it('emits domain-only success and failure events and supports unsubscribe', async () => {
    const engine = createKairoMusicEngine({
      fixtureTracks: [
        {
          id: 'night-drive',
          title: 'Night Drive',
          artists: [{ name: 'Fixture Artist' }],
        },
      ],
    });
    const success = vi.fn();
    const failure = vi.fn();
    const unsubscribe = engine.on('parseSucceeded', success);
    engine.on('parseFailed', failure);

    await engine.parse({ ...context, input: 'Night Drive' });
    expect(success).toHaveBeenCalledWith({
      type: 'parseSucceeded',
      guildId: 'guild-1',
      requestedBy: 'user-1',
      requestId: 'req-1',
      resultKind: 'search',
    });
    expect(success.mock.calls[0]?.[0]).not.toHaveProperty('input');

    await expect(engine.parse({ ...context, input: '' })).rejects.toMatchObject(
      { code: 'INVALID_QUERY' },
    );
    expect(failure).toHaveBeenCalledWith({
      type: 'parseFailed',
      guildId: 'guild-1',
      requestedBy: 'user-1',
      requestId: 'req-1',
      code: 'INVALID_QUERY',
    });
    unsubscribe();
    await engine.parse({ ...context, input: 'Night Drive' });
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('preserves fixture order and respects the result limit', async () => {
    const engine = createKairoMusicEngine({
      fixtureTracks: [
        { id: 'a', title: 'Song A', artists: [{ name: 'Artist' }] },
        { id: 'b', title: 'Song B', artists: [{ name: 'Artist' }] },
      ],
    });
    const result = await engine.parse({
      ...context,
      input: 'Artist Song',
      maxResults: 1,
    });
    expect(result).toMatchObject({
      kind: 'search',
      candidates: [{ id: 'fixture:a' }],
    });
  });

  it('keeps subscriber failures from changing a successful parse', async () => {
    const engine = createKairoMusicEngine({
      fixtureTracks: [
        { id: 'a', title: 'Song A', artists: [{ name: 'Artist' }] },
      ],
    });
    engine.on('parseSucceeded', () => {
      throw new Error('listener failed');
    });
    await expect(
      engine.parse({ ...context, input: 'Artist Song' }),
    ).resolves.toMatchObject({
      kind: 'search',
      candidates: [{ id: 'fixture:a' }],
    });
  });
});
