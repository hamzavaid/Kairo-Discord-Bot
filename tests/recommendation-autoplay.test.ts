import { describe, expect, it, vi } from 'vitest';
import { RecommendationService } from '../apps/bot/src/services/RecommendationService.js';
import { AutoplayService } from '../apps/bot/src/services/AutoplayService.js';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { libraryTrack } from './helpers/libraryModel.js';
const track = (id: string, artist = 'Artist') => ({
  ...libraryTrack,
  sourceProvider: 'youtube-sr' as const,
  sourceId: id,
  id: `youtube-sr:${id}`,
  artists: [{ name: artist }],
});
describe('canonical recommendations and radio', () => {
  it('excludes current/recent identities, deduplicates and favors less recent artists without playback', async () => {
    const infoResults = vi.fn(async () => [
      track('current'),
      track('recent'),
      track('new', 'Other'),
      track('new', 'Other'),
      track('old-artist'),
    ]);
    const music = {
      info: vi.fn(async () => track('current')),
      currentTrack: () => track('current'),
      infoResults,
    };
    const recent = vi.fn(async () => [{ track: track('recent') }]);
    const service = new RecommendationService(
      music as never,
      { recent } as never,
    );
    const result = await service.recommend({ guildId: 'g', userId: 'u' });
    expect(result.map((t) => t.sourceId)).toEqual(['new', 'old-artist']);
    expect(infoResults).toHaveBeenCalled();
  });
  it('falls back to liked/history seeds, maps empty/failing discovery and respects abort', async () => {
    const service = new RecommendationService(
      {
        currentTrack: () => {
          throw Error();
        },
        infoResults: async () => [track('new')],
      } as never,
      { recent: async () => [] } as never,
      { liked: async () => ({ entries: [{ track: track('seed') }] }) } as never,
    );
    expect(
      (await service.recommend({ guildId: 'g', userId: 'u' }))[0]?.sourceId,
    ).toBe('new');
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.recommend({
        guildId: 'g',
        userId: 'u',
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
  it('does not enqueue after manual input supersedes a pending recommendation and does not reconnect', async () => {
    let finish!: (value: unknown[]) => void;
    const pending = new Promise<unknown[]>((r) => {
      finish = r;
    });
    const events = new Map<string, (e: never) => void>();
    let generation = 1;
    const engine = {
      on: (type: string, listener: (e: never) => void) => {
        events.set(type, listener);
        return () => events.delete(type);
      },
      getQueue: () => ({ generation, current: undefined, upcoming: [] }),
      getPlayback: () => ({ state: 'IDLE' }),
      enqueueAutoplay: vi.fn(async () => true),
    };
    const service = new AutoplayService(
      engine as never,
      { get: async () => ({ controls: { autoplay: true } }) } as never,
      { recommend: () => pending } as never,
    );
    service.attach();
    events.get('queueExhausted')?.({
      guildId: 'g',
      generation: 1,
      seed: track('seed'),
      userId: 'u',
    } as never);
    await Promise.resolve();
    generation = 2;
    finish([track('new')]);
    await service.drain();
    expect(engine.enqueueAutoplay).not.toHaveBeenCalled();
    await service.close();
  });
  it('atomic radio admission rejects stale generations and disconnected sessions', async () => {
    const engine = createKairoMusicEngine();
    expect(
      await engine.enqueueAutoplay({
        guildId: 'g',
        track: track('new'),
        enqueuedBy: 'u',
        expectedGeneration: 0,
      }),
    ).toBe(false);
    await engine.shutdown();
  });
});

it.each(['disabled', 'failed', 'disconnected', 'empty'])(
  'radio handles %s without unsafe enqueue or reconnect',
  async (scenario) => {
    const events = new Map<string, (e: never) => void>();
    let finish!: (tracks: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => {
      finish = resolve;
    });
    const engine = {
      on: (name: string, cb: (e: never) => void) => {
        events.set(name, cb);
        return () => events.delete(name);
      },
      getQueue: () => ({ generation: 1, current: undefined, upcoming: [] }),
      getPlayback: () => ({
        state: scenario === 'disconnected' ? 'DISCONNECTED' : 'IDLE',
      }),
      enqueueAutoplay: vi.fn(),
    };
    const report = vi.fn();
    const service = new AutoplayService(
      engine as never,
      {
        get: async () => ({ controls: { autoplay: scenario !== 'disabled' } }),
      } as never,
      {
        recommend: () =>
          scenario === 'failed'
            ? Promise.reject(Error('provider unavailable'))
            : pending,
      } as never,
      report,
    );
    service.attach();
    events.get('queueExhausted')?.({
      guildId: 'g',
      generation: 1,
      seed: track('seed'),
      userId: 'u',
    } as never);
    await Promise.resolve();
    finish(scenario === 'empty' ? [] : [track('new')]);
    await service.drain();
    expect(engine.enqueueAutoplay).not.toHaveBeenCalled();
    if (scenario === 'failed' || scenario === 'empty')
      expect(report).toHaveBeenCalledOnce();
    await service.close();
  },
);

it('cancels both query-seed resolution and recommendation candidate searches', async () => {
  const abort = new AbortController();
  const signal = abort.signal;
  const info = vi.fn(async () => track('seed'));
  const infoResults = vi.fn(async () => [track('new')]);
  const service = new RecommendationService({ info, infoResults } as never);
  await service.recommend({ query: 'seed', guildId: 'g', userId: 'u', signal });
  expect(info).toHaveBeenCalledWith('seed', 'g', 'u', expect.any(AbortSignal));
  expect(infoResults).toHaveBeenCalledWith(
    expect.any(String),
    'g',
    'u',
    25,
    expect.any(AbortSignal),
  );
  abort.abort();
  expect(
    (info.mock.calls[0] as unknown as [string, string, string, AbortSignal])[3]
      .aborted,
  ).toBe(true);
  expect(
    (
      infoResults.mock.calls[0] as unknown as [
        string,
        string,
        string,
        number,
        AbortSignal,
      ]
    )[4].aborted,
  ).toBe(true);
});
