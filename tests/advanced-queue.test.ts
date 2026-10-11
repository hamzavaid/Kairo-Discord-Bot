import { describe, expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { QueueControlService } from '../apps/bot/src/services/QueueControlService.js';
import { libraryTrack } from './helpers/libraryModel.js';
const tracks = Array.from({ length: 4 }, (_, n) => ({
  ...libraryTrack,
  id: `song:${n}`,
  title: `Song ${n}`,
  sourceProvider: 'youtube-sr' as const,
  artists: [{ name: n === 2 ? 'Special Artist' : 'Artist' }],
  album: { title: 'Album' },
}));
describe('stable queue selection and concurrent controls', () => {
  it('searches normalized metadata and moves/removes captured entries atomically', async () => {
    const engine = createKairoMusicEngine();
    const q = await engine.enqueueMany({
      guildId: 'g',
      tracks,
      enqueuedBy: 'u',
    });
    expect(
      engine.searchQueue('g', 'SPECIAL artist').map((e) => e.track.title),
    ).toEqual(['Song 2']);
    const selected = q.upcoming[1]!;
    await engine.shuffle('g');
    await engine.remove({ guildId: 'g', entryId: selected.id });
    expect(engine.getQueue('g').upcoming.map((e) => e.id)).not.toContain(
      selected.id,
    );
    const after = engine.getQueue('g');
    const from = after.upcoming[0]!;
    const target = after.upcoming[1]!;
    await engine.move({
      guildId: 'g',
      entryId: from.id,
      to: 2,
      toEntryId: target.id,
    });
    expect(engine.getQueue('g').upcoming.at(-1)?.id).toBe(from.id);
    await expect(
      engine.move({ guildId: 'g', entryId: selected.id, to: 1 }),
    ).rejects.toMatchObject({ code: 'QUEUE_ENTRY_NOT_FOUND' });
    await engine.shutdown();
  });
  it('captures requester ownership and rejects missing positions before mutation', async () => {
    const removeEntry = vi.fn();
    const authorize = vi.fn();
    const entry = { id: 'selected', enqueuedBy: 'owner', track: tracks[1] };
    const music = {
      queue: () => ({ upcoming: [entry], generation: 2 }),
      removeEntry,
    };
    const service = new QueueControlService(
      music as never,
      {} as never,
      { authorize } as never,
    );
    await service.remove({ guildId: 'g' } as never, 1);
    expect(authorize).toHaveBeenCalledWith(
      expect.any(Object),
      music,
      expect.any(Object),
      'remove',
      'owner',
    );
    expect(removeEntry).toHaveBeenCalledWith('g', 'selected', 2);
    await expect(
      service.remove({ guildId: 'g' } as never, 2),
    ).rejects.toMatchObject({ code: 'QUEUE_ENTRY_NOT_FOUND' });
    expect(removeEntry).toHaveBeenCalledOnce();
  });
});
