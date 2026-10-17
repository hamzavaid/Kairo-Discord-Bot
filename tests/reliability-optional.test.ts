import { expect, it, vi } from 'vitest';
import { BackgroundJobs } from '../apps/bot/src/services/BackgroundJobs.js';
import { LyricsService } from '../apps/bot/src/services/LyricsService.js';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { libraryTrack } from './helpers/libraryModel.js';

it('cancels optional work on shutdown without disabling manual fixture metadata', async () => {
  const jobs = new BackgroundJobs();
  const provider = {
    id: 'broken',
    get: vi.fn(() => new Promise<never>(() => {})),
  };
  const lyrics = new LyricsService([provider], jobs);
  const request = lyrics.get(libraryTrack);
  const canceled = expect(request).rejects.toMatchObject({
    code: 'OPERATION_CANCELLED',
  });
  await vi.waitFor(() => expect(provider.get).toHaveBeenCalled());
  jobs.close();
  await canceled;
  const engine = createKairoMusicEngine({
    fixtureTracks: [
      { id: 'demo', title: 'Song', artists: [{ name: 'Artist' }] },
    ],
  });
  await expect(
    engine.parse({ input: 'Song', guildId: 'g', requestedBy: 'u' }),
  ).resolves.toMatchObject({ kind: 'search' });
  await engine.shutdown();
});
it('bounds optional waiting jobs and cleans timers on cancellation', async () => {
  const jobs = new BackgroundJobs(undefined, 1);
  const abort = new AbortController();
  const active = jobs.run(
    'recommendation',
    'g',
    () => new Promise<never>(() => {}),
    abort.signal,
  );
  const observed = [active.catch((e: unknown) => e)];
  for (let i = 0; i < 16; i++)
    observed.push(
      jobs
        .run('recommendation', `g${i}`, async () => 1)
        .catch((e: unknown) => e),
    );
  await expect(
    jobs.run('recommendation', 'excess', async () => 1),
  ).rejects.toMatchObject({ code: 'RESOURCE_BUSY' });
  jobs.close();
  abort.abort();
  await Promise.all(observed);
});
