import { describe, expect, it } from 'vitest';
import { createKairoMusicEngine, MusicError } from '@kairo/music-engine';

const fixtures = [
  {
    id: 'one-more-time',
    title: 'One More Time',
    artists: [{ name: 'Daft Punk' }],
    durationMs: 320000,
  },
  {
    id: 'night-drive',
    title: 'Night Drive',
    artists: [{ name: 'Fixture Artist' }],
  },
];

const engine = createKairoMusicEngine({ fixtureTracks: fixtures });
const context = { guildId: 'guild-1', requestedBy: 'user-1' };

describe('public offline parser', () => {
  it('normalizes free text and returns canonical metadata with original provenance', async () => {
    const result = await engine.parse({
      ...context,
      input: '  Daft   Punk  One More Time  ',
    });
    expect(result.kind).toBe('search');
    if (result.kind !== 'search') throw new Error('Expected search result');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: 'fixture:one-more-time',
      title: 'One More Time',
      artists: [{ name: 'Daft Punk' }],
      durationMs: 320000,
      sourceProvider: 'fixture',
      isLive: false,
      requestedBy: 'user-1',
      provenance: {
        input: '  Daft   Punk  One More Time  ',
        parsedBy: 'search',
      },
    });
    expect(result.candidates[0]?.createdAt).toBeInstanceOf(Date);
    expect(result.candidates[0]).not.toHaveProperty('stream');
  });

  it('parses fixture URLs offline and preserves URL identity', async () => {
    const result = await engine.parse({
      ...context,
      input: 'https://fixture.kairo.invalid/tracks/night-drive?utm_source=test',
    });
    expect(result.kind).toBe('track');
    if (result.kind !== 'track') throw new Error('Expected track result');
    expect(result.track).toMatchObject({
      id: 'fixture:night-drive',
      canonicalUrl: 'https://fixture.kairo.invalid/tracks/night-drive',
      sourceId: 'night-drive',
      provenance: {
        input:
          'https://fixture.kairo.invalid/tracks/night-drive?utm_source=test',
        parsedBy: 'fixture',
      },
    });
  });

  it('rejects invalid and unsupported inputs with stable codes', async () => {
    await expect(
      engine.parse({ ...context, input: ' \u2003 ' }),
    ).rejects.toMatchObject({
      code: 'INVALID_QUERY',
    });
    await expect(
      engine.parse({ ...context, input: 'https://example.com/song' }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROVIDER',
    });
    await expect(
      engine.parse({ ...context, input: 'ftp://example.com/song' }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_PROVIDER',
    });
    await expect(
      engine.parse({ ...context, input: 'https://' }),
    ).rejects.toMatchObject({
      code: 'INVALID_QUERY',
    });
    await expect(
      engine.parse({ ...context, input: 'Night Drive', maxResults: 0 }),
    ).rejects.toMatchObject({
      code: 'INVALID_QUERY',
    });
    await expect(
      engine.parse({
        ...context,
        input: 'https://fixture.kairo.invalid/tracks/missing',
      }),
    ).rejects.toMatchObject({
      code: 'NO_SEARCH_RESULTS',
    });
    expect(MusicError).toBeDefined();
  });
});
