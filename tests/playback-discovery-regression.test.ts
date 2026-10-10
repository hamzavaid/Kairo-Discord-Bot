import { expect, it, vi } from 'vitest';
import { createKairoMusicEngine, type Track } from '@kairo/music-engine';

function source(
  title = 'Example Song',
  artist = 'Example Artist',
  durationMs = 180000,
): Track {
  return {
    id: 'spotify:source',
    sourceId: 'source',
    sourceProvider: 'spotify',
    title,
    artists: [{ name: artist }],
    durationMs,
    isLive: false,
    requestedBy: 'user',
    createdAt: new Date('2026-01-01'),
    provenance: { input: title, parsedBy: 'spotify' },
  };
}
const video = (
  title = 'Example Song',
  artist = 'Example Artist - Topic',
  duration = 180000,
  id = 'abcdefghijk',
) => ({ id, title, channel: { name: artist }, duration });

it('matches explicit artist/title credits without mistaking the uploader for the performer', async () => {
  const engine = createKairoMusicEngine({
    youtubeSr: {
      search: async () => [
        video(
          'Example Artist - Example Song (Official Audio)',
          'Archive Channel',
        ),
      ],
    },
  });
  try {
    expect(
      (await engine.preparePlayable(source())).provenance.confidence,
    ).toBeGreaterThanOrEqual(0.82);
  } finally {
    await engine.shutdown();
  }
});
it('does not infer artist identity from an unrelated title or uploader', async () => {
  const engine = createKairoMusicEngine({
    youtubeSr: {
      search: async () => [
        video('Other Artist - Example Song', 'Archive Channel'),
      ],
    },
  });
  try {
    await expect(engine.preparePlayable(source())).rejects.toMatchObject({
      code: 'NO_RELIABLE_MATCH',
    });
  } finally {
    await engine.shutdown();
  }
});
it('keeps all 25 discovery candidates available to equivalence scoring', async () => {
  const engine = createKairoMusicEngine({
    youtubeSr: {
      search: async () => [
        ...Array.from({ length: 24 }, (_, i) =>
          video(
            'Example Song',
            'Example Artist - Topic',
            380000,
            `bad${String(i).padStart(8, '0')}`,
          ),
        ),
        video('Example Song'),
      ],
    },
  });
  try {
    expect((await engine.preparePlayable(source())).sourceId).toBe(
      'abcdefghijk',
    );
  } finally {
    await engine.shutdown();
  }
});
it('ignores a malformed search hit without discarding valid music results', async () => {
  const engine = createKairoMusicEngine({
    youtubeSr: { search: async () => [{ title: 'Unavailable' }, video()] },
  });
  try {
    expect((await engine.preparePlayable(source())).sourceId).toBe(
      'abcdefghijk',
    );
  } finally {
    await engine.shutdown();
  }
});
it('retries a transient discovery failure using the same provider', async () => {
  const search = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary network failure'))
    .mockResolvedValue([video()]);
  const engine = createKairoMusicEngine({ youtubeSr: { search } });
  try {
    expect((await engine.preparePlayable(source())).sourceId).toBe(
      'abcdefghijk',
    );
    expect(search).toHaveBeenCalledTimes(2);
  } finally {
    await engine.shutdown();
  }
});
it('tries a precise second query after unsuccessful matching', async () => {
  const search = vi
    .fn()
    .mockResolvedValueOnce([video('Other Song')])
    .mockResolvedValue([video()]);
  const engine = createKairoMusicEngine({ youtubeSr: { search } });
  try {
    expect((await engine.preparePlayable(source())).sourceId).toBe(
      'abcdefghijk',
    );
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1]![0]).toContain('"Example Song"');
  } finally {
    await engine.shutdown();
  }
});
it.each([
  [
    'Shiosai Sunset',
    'Natsu Summer',
    '\u6f6e\u9a12\u30b5\u30f3\u30bb\u30c3\u30c8',
    246493,
    247000,
  ],
  [
    'Romantic',
    'Yusuke Honma',
    '\u30ed\u30de\u30f3\u30c6\u30a3\u30c3\u30af',
    183026,
    184000,
  ],
] as const)(
  'matches %s to its Japanese reading with strong artist and duration evidence',
  async (title, artist, japanese, duration, candidateDuration) => {
    const engine = createKairoMusicEngine({
      youtubeSr: {
        search: async () => [
          video(japanese, `${artist} - Topic`, candidateDuration),
        ],
      },
    });
    try {
      const result = await engine.preparePlayable(
        source(title, artist, duration),
      );
      expect(result.provenance.confidence).toBeGreaterThanOrEqual(0.82);
      expect(
        result.provenance.matchSignals?.titleSimilarity,
      ).toBeGreaterThanOrEqual(0.85);
    } finally {
      await engine.shutdown();
    }
  },
  15000,
);
it.each([
  ['Unrelated', 'Yusuke Honma - Topic', 184000],
  [
    '\u30ed\u30de\u30f3\u30c6\u30a3\u30c3\u30af',
    'Other Artist - Topic',
    184000,
  ],
  [
    '\u30ed\u30de\u30f3\u30c6\u30a3\u30c3\u30af',
    'Yusuke Honma - Topic',
    210000,
  ],
  [
    '\u30ed\u30de\u30f3\u30c6\u30a3\u30c3\u30af (Cover)',
    'Yusuke Honma - Topic',
    184000,
  ],
] as const)(
  'rejects unsafe multilingual identity: %s / %s / %s',
  async (title, artist, duration) => {
    const engine = createKairoMusicEngine({
      youtubeSr: { search: async () => [video(title, artist, duration)] },
    });
    try {
      await expect(
        engine.preparePlayable(source('Romantic', 'Yusuke Honma', 183026)),
      ).rejects.toMatchObject({ code: 'NO_RELIABLE_MATCH' });
    } finally {
      await engine.shutdown();
    }
  },
  15000,
);
it('cancels discovery before a retry or secondary query starts', async () => {
  const abort = new AbortController();
  const search = vi.fn(async () => {
    abort.abort();
    throw new Error('cancelled');
  });
  const engine = createKairoMusicEngine({ youtubeSr: { search } });
  try {
    await expect(
      engine.preparePlayable(source(), abort.signal),
    ).rejects.toMatchObject({ code: 'PARSER_CANCELLED' });
    expect(search).toHaveBeenCalledOnce();
  } finally {
    await engine.shutdown();
  }
});

it.each([
  [
    'monkey buisiness',
    ['RYUSENKEI', 'HITOMITOI'],
    'Ryusenkei & Hitomitoi - Japanese Title (Monkey Business)',
    'Archive Channel',
  ],
  [
    'Spring Lovers',
    ['Minuano'],
    'Minuano - Japanese Title (spring lovers // other language)',
    'Archive Channel',
  ],
  [
    'Example Song',
    ['Example Artist'],
    'Example Song',
    'Example Artist Official',
  ],
] as const)(
  'handles artist credits and bilingual titles for %s',
  async (title, artists, candidateTitle, uploader) => {
    const track = {
      ...source(title),
      artists: artists.map((name) => ({ name })),
    };
    const engine = createKairoMusicEngine({
      youtubeSr: { search: async () => [video(candidateTitle, uploader)] },
    });
    try {
      expect(
        (await engine.preparePlayable(track)).provenance.confidence,
      ).toBeGreaterThanOrEqual(0.82);
    } finally {
      await engine.shutdown();
    }
  },
);

it('matches cross-script artist readings only with an exact title and tight duration', async () => {
  const japaneseArtist =
    '\u30cf\u30a4\u30fb\u30d5\u30a1\u30a4\u30fb\u30bb\u30c3\u30c8';
  const engine = createKairoMusicEngine({
    youtubeSr: {
      search: async () => [
        video('Sky Restaurant', `${japaneseArtist} - Topic`),
      ],
    },
  });
  try {
    expect(
      (await engine.preparePlayable(source('Sky Restaurant', 'Hi-Fi Set')))
        .provenance.confidence,
    ).toBeGreaterThanOrEqual(0.82);
  } finally {
    await engine.shutdown();
  }
});
it('matches explicit slash-separated translated subtitles', async () => {
  const engine = createKairoMusicEngine({
    youtubeSr: {
      search: async () => [
        video(
          '\u771f\u591c\u4e2d\u306e\u30c9\u30a2 / Stay With Me',
          'Miki Matsubara - Topic',
        ),
      ],
    },
  });
  try {
    expect(
      (
        await engine.preparePlayable(
          source('Mayonaka no Door / Stay With Me', 'Miki Matsubara'),
        )
      ).provenance.confidence,
    ).toBeGreaterThanOrEqual(0.82);
  } finally {
    await engine.shutdown();
  }
});

it.each([
  ['Unrelated Song', 180000],
  ['Sky Restaurant', 230000],
] as const)(
  'does not use artist pronunciation to rescue %s at %s ms',
  async (title, duration) => {
    const artist =
      '\u30cf\u30a4\u30fb\u30d5\u30a1\u30a4\u30fb\u30bb\u30c3\u30c8';
    const engine = createKairoMusicEngine({
      youtubeSr: {
        search: async () => [video(title, `${artist} - Topic`, duration)],
      },
    });
    try {
      await expect(
        engine.preparePlayable(source('Sky Restaurant', 'Hi-Fi Set')),
      ).rejects.toMatchObject({ code: 'NO_RELIABLE_MATCH' });
    } finally {
      await engine.shutdown();
    }
  },
);
it('bounds persistent provider failures to two attempts and preserves typed errors', async () => {
  const search = vi.fn(async () => {
    throw new Error('temporary upstream failure');
  });
  const engine = createKairoMusicEngine({ youtubeSr: { search } });
  try {
    await expect(engine.preparePlayable(source())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
    });
    expect(search).toHaveBeenCalledTimes(2);
  } finally {
    await engine.shutdown();
  }
});

it('recognizes a trailing performer credit on a bilingual lyric upload', async () => {
  const title = '\u30b9\u30ab\u30a4\u30ec\u30b9\u30c8\u30e9\u30f3';
  const engine = createKairoMusicEngine({
    youtubeSr: {
      search: async () => [
        video(
          `Sky Restaurant [${title}] - Hi-Fi Set - Lyrics (ENGLISH, ROMAJI & JAPANESE)`,
          'Archive Channel',
        ),
      ],
    },
  });
  try {
    expect(
      (await engine.preparePlayable(source(title, 'Hi-Fi Set'))).provenance
        .confidence,
    ).toBeGreaterThanOrEqual(0.82);
  } finally {
    await engine.shutdown();
  }
});

it('rejects another mix even when a bilingual title and artist match', async () => {
  const engine = createKairoMusicEngine({
    youtubeSr: {
      search: async () => [
        video('Example Artist - Other Language (Example Song) - Another Mix'),
      ],
    },
  });
  try {
    await expect(engine.preparePlayable(source())).rejects.toMatchObject({
      code: 'NO_RELIABLE_MATCH',
    });
  } finally {
    await engine.shutdown();
  }
});
