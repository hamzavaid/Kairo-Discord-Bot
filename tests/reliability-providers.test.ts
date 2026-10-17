import { expect, it, vi } from 'vitest';
import { MusicError, createKairoMusicEngine } from '@kairo/music-engine';
import { ProviderSupervisor } from '../packages/music-engine/src/reliability/ProviderSupervisor.js';
import { boundedJson } from '../packages/music-engine/src/providers/metadata/transport.js';
import { YoutubeSrProvider } from '../packages/music-engine/src/providers/metadata/YoutubeSrProvider.js';

it('bounds raw unofficial SDK calls even when canceled transports ignore AbortSignal', async () => {
  const finishes: ((value: unknown[]) => void)[] = [];
  const search = vi.fn(
    () => new Promise<unknown[]>((resolve) => finishes.push(resolve)),
  );
  const provider = new YoutubeSrProvider({ search });
  for (let n = 0; n < 8; n++) {
    const controller = new AbortController();
    const job = provider.search('fixture', 1, controller.signal);
    const failed = expect(job).rejects.toMatchObject({
      code: 'PARSER_CANCELLED',
    });
    await Promise.resolve();
    controller.abort();
    await failed;
  }
  await expect(provider.search('overflow', 1)).rejects.toMatchObject({
    code: 'RESOURCE_BUSY',
  });
  expect(search).toHaveBeenCalledTimes(8);
  for (const finish of finishes) finish([]);
  await new Promise((resolve) => setImmediate(resolve));
  search.mockResolvedValueOnce([]);
  await expect(provider.search('recovered', 1)).resolves.toEqual([]);
});

it('does not send queued provider requests through an opened circuit', async () => {
  const supervisor = new ProviderSupervisor({
    attempts: 1,
    failureThreshold: 1,
  });
  const reject: ((error: unknown) => void)[] = [];
  const operation = vi.fn(
    () =>
      new Promise((_, no) => {
        reject.push(no);
      }),
  );
  const first = supervisor.run('youtube-api', operation);
  const second = supervisor.run('youtube-api', operation);
  const third = supervisor.run('youtube-api', operation);
  const failures = [first, second, third].map((job) =>
    expect(job).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' }),
  );
  await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
  reject[0]!(new MusicError('PROVIDER_UNAVAILABLE', 'Unavailable', true));
  await vi.waitFor(() =>
    expect(supervisor.snapshot()[0]?.circuit).toBe('OPEN'),
  );
  expect(operation).toHaveBeenCalledTimes(2);
  reject[1]!(new MusicError('PROVIDER_UNAVAILABLE', 'Unavailable', true));
  await Promise.all(failures);
  supervisor.close();
});

it('honors Retry-After and bounded exponential retry without retrying authorization', async () => {
  let now = 0;
  const sleep = vi.fn(async (ms: number) => {
    now += ms;
  });
  const supervisor = new ProviderSupervisor({
    now: () => now,
    sleep,
    random: () => 0,
  });
  const operation = vi
    .fn()
    .mockRejectedValueOnce(
      new MusicError('PROVIDER_UNAVAILABLE', 'Busy', true, undefined, {
        httpStatus: 429,
        retryAfterMs: 1200,
      }),
    )
    .mockResolvedValue('ok');
  expect(await supervisor.run('spotify', operation)).toBe('ok');
  expect(sleep).toHaveBeenCalledWith(1200, expect.any(AbortSignal));
  const auth = vi.fn(async () => {
    throw new MusicError('PROVIDER_AUTH_REQUIRED', 'Authorize');
  });
  await expect(supervisor.run('spotify', auth)).rejects.toMatchObject({
    code: 'PROVIDER_AUTH_REQUIRED',
  });
  expect(auth).toHaveBeenCalledTimes(1);
  supervisor.close();
});
it('opens on repeated transient failures, admits one half-open probe, and closes on success', async () => {
  let now = 0;
  const supervisor = new ProviderSupervisor({
    now: () => now,
    attempts: 1,
    failureThreshold: 2,
    cooldownMs: 100,
  });
  const fail = vi.fn(async () => {
    throw new MusicError('PROVIDER_UNAVAILABLE', 'Busy', true);
  });
  for (let i = 0; i < 2; i++)
    await expect(supervisor.run('youtube-api', fail)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  expect(supervisor.snapshot()[0]?.circuit).toBe('OPEN');
  await expect(supervisor.run('youtube-api', fail)).rejects.toMatchObject({
    code: 'PROVIDER_UNAVAILABLE',
  });
  expect(fail).toHaveBeenCalledTimes(2);
  now = 101;
  let done!: (value: string) => void;
  const probe = supervisor.run(
    'youtube-api',
    () =>
      new Promise<string>((resolve) => {
        done = resolve;
      }),
  );
  await vi.waitFor(() => expect(done).toBeTypeOf('function'));
  await expect(supervisor.run('youtube-api', fail)).rejects.toMatchObject({
    code: 'PROVIDER_UNAVAILABLE',
  });
  done('ok');
  await probe;
  expect(supervisor.snapshot()[0]?.circuit).toBe('CLOSED');
  supervisor.close();
});
it('preserves only safe Retry-After diagnostics on HTTP failures', async () => {
  await expect(
    boundedJson(
      async () =>
        new Response('private', {
          status: 429,
          headers: { 'Retry-After': '2' },
        }),
      'https://example.invalid',
      {},
      100,
    ),
  ).rejects.toMatchObject({
    diagnostics: { httpStatus: 429, retryAfterMs: 2000 },
  });
});
it('continues explicit fallback when the primary circuit opens', async () => {
  const primary = vi.fn(async () => {
    throw new Error('unavailable');
  });
  const fetcher = vi.fn(
    async (url: string | URL | Request) =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: String(url).includes('/search?')
                ? { videoId: 'abcdefghijk' }
                : 'abcdefghijk',
              snippet: { title: 'Song', channelTitle: 'Artist' },
              contentDetails: { duration: 'PT3M' },
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  const engine = createKairoMusicEngine({
    youtubeSr: { search: primary },
    youtubeApi: { apiKey: 'test', fetcher },
    fallbackProviders: ['youtube-api'],
    reliability: { providerAttempts: 1, circuitFailures: 1 },
  });
  const req = { input: 'song', guildId: 'g', requestedBy: 'u' };
  await expect(engine.parse(req)).resolves.toMatchObject({ kind: 'search' });
  await expect(engine.parse(req)).resolves.toMatchObject({ kind: 'search' });
  expect(primary).toHaveBeenCalledTimes(1);
  await engine.shutdown();
});
