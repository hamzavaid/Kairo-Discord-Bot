import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { MusicBrainzProvider } from '../packages/music-engine/src/providers/musicbrainz/MusicBrainzProvider.js';

const id = 'b9ad642e-b012-41c7-b72a-42cf4911f9ff';
const contact = 'https://github.com/hamzavaid/Kairo-Discord-Bot';
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures/musicbrainz', name), 'utf8');
const jsonResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });
const context = {
  guildId: 'guild-1',
  requestedBy: 'user-1',
  requestId: 'request-1',
};

describe('MusicBrainz public metadata integration', () => {
  it('looks up a recording URL and returns canonical metadata without playback data', async () => {
    const fetcher = vi.fn(async () => jsonResponse(fixture('recording.json')));
    const engine = createKairoMusicEngine({
      musicBrainz: { contact, fetcher },
    });
    const result = await engine.parse({
      ...context,
      input: `https://musicbrainz.org/recording/${id}?utm_source=test`,
    });
    expect(result).toMatchObject({
      kind: 'track',
      track: {
        id: `musicbrainz:${id}`,
        title: 'LAST ANGEL',
        artists: [{ name: 'Koda Kumi' }, { name: 'Tohoshinki' }],
        durationMs: 230000,
        canonicalUrl: `https://musicbrainz.org/recording/${id}`,
        provenance: { parsedBy: 'musicbrainz' },
      },
    });
    if (result.kind !== 'track') throw new Error('Expected track');
    expect(result.track).not.toHaveProperty('stream');
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain(`/ws/2/recording/${id}`);
    expect(url).toContain('fmt=json');
    expect(options.headers).toMatchObject({
      'User-Agent': expect.stringContaining(contact),
    });
  });

  it('searches one bounded page, preserves provider ranking, and caches repeated requests', async () => {
    const fetcher = vi.fn(async () => jsonResponse(fixture('search.json')));
    const engine = createKairoMusicEngine({
      musicBrainz: { contact, fetcher },
    });
    const request = {
      ...context,
      input: 'LAST ANGEL',
      preferredProvider: 'musicbrainz',
      maxResults: 2,
    };
    const first = await engine.parse(request);
    const second = await engine.parse(request);
    expect(first).toMatchObject({
      kind: 'search',
      candidates: [
        { id: `musicbrainz:${id}` },
        { id: 'musicbrainz:026fa041-3917-4c73-9079-ed16e36f20f8' },
      ],
    });
    expect(second.kind).toBe('search');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url] = fetcher.mock.calls[0] as unknown as [string];
    expect(url).toContain('limit=2');
    expect(url).toContain('dismax=true');
    expect(url).not.toContain('offset=');
  });

  it('reports bounded request diagnostics without logging the query', async () => {
    const info = vi.fn();
    const warn = vi.fn();
    const fetcher = vi.fn(async () => jsonResponse(fixture('search.json')));
    const engine = createKairoMusicEngine({
      musicBrainz: { contact, fetcher, logger: { info, warn } },
    });
    await engine.parse({
      ...context,
      input: 'private query',
      preferredProvider: 'musicbrainz',
    });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'musicbrainz',
        operation: 'search',
        status: 200,
        latencyMs: expect.any(Number),
      }),
      expect.any(String),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('private query');
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects malformed responses and unsupported recording URLs', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse('{"recordings":[{"id":"bad"}]}'),
    );
    const engine = createKairoMusicEngine({
      musicBrainz: { contact, fetcher },
    });
    await expect(
      engine.parse({
        ...context,
        input: 'a search',
        preferredProvider: 'musicbrainz',
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_PARSE_ERROR',
      correlationId: 'request-1',
    });
    await expect(
      engine.parse({
        ...context,
        input: 'https://musicbrainz.org/recording/not-a-uuid',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
    await expect(
      engine.parse({
        ...context,
        input: `https://musicbrainz.org.evil.test/recording/${id}`,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER' });
  });
});

describe('MusicBrainz network boundaries', () => {
  it('rejects oversized JSON before passing it to the domain layer', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        JSON.stringify({
          count: 0,
          offset: 0,
          recordings: [],
          padding: 'x'.repeat(600_000),
        }),
      ),
    );
    const provider = new MusicBrainzProvider({
      contact,
      fetcher,
      maxAttempts: 1,
      minIntervalMs: 0,
    });
    await expect(provider.search('oversized', 1)).rejects.toMatchObject({
      code: 'PROVIDER_PARSE_ERROR',
    });
  });

  it('maps a stalled request to a typed timeout without exposing transport details', async () => {
    const fetcher = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new Error('private transport detail')),
          );
        }),
    );
    const provider = new MusicBrainzProvider({
      contact,
      fetcher,
      timeoutMs: 15,
      maxAttempts: 1,
      minIntervalMs: 0,
    });
    await expect(provider.search('LAST ANGEL', 2)).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      retryable: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 once and respects the request interval', async () => {
    let time = 0;
    const delays: number[] = [];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('{}', 503))
      .mockResolvedValueOnce(jsonResponse(fixture('search.json')));
    const provider = new MusicBrainzProvider({
      contact,
      fetcher,
      now: () => time,
      sleep: async (ms: number) => {
        delays.push(ms);
        time += ms;
      },
      maxAttempts: 2,
    });
    const results = await provider.search('LAST ANGEL', 2);
    expect(results).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(delays.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(
      1000,
    );
  });

  it('reports cancellation during retry delay without another request', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => jsonResponse('{}', 503));
    const provider = new MusicBrainzProvider({
      contact,
      fetcher,
      minIntervalMs: 0,
      sleep: async () => {
        controller.abort();
        throw new Error('private cancellation detail');
      },
    });
    await expect(
      provider.search('cancel', 1, controller.signal),
    ).rejects.toMatchObject({ code: 'PARSER_CANCELLED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('expires metadata cache entries and opens a circuit after repeated failures', async () => {
    let time = 0;
    const fetcher = vi.fn(async () => jsonResponse(fixture('recording.json')));
    const provider = new MusicBrainzProvider({
      contact,
      fetcher,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
      metadataCacheMs: 100,
      minIntervalMs: 0,
    });
    const input = {
      kind: 'provider-track' as const,
      providerId: 'musicbrainz',
      sourceId: id,
      canonicalUrl: `https://musicbrainz.org/recording/${id}`,
    };
    await provider.parse(input);
    await provider.parse(input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    time = 101;
    await provider.parse(input);
    expect(fetcher).toHaveBeenCalledTimes(2);

    const failingFetch = vi.fn(async () => jsonResponse('{}', 503));
    const failing = new MusicBrainzProvider({
      contact,
      fetcher: failingFetch,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
      maxAttempts: 1,
      minIntervalMs: 0,
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(failing.search('missing', 1)).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
      });
    }
    await expect(failing.search('missing', 1)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(failingFetch).toHaveBeenCalledTimes(3);
  });
});
