import { describe, expect, it, vi } from 'vitest';
import { MongoLibraryRepository, trackIdentity } from '@kairo/data';
import {
  LibraryService,
  libraryPage,
} from '../apps/bot/src/services/LibraryService.js';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';
import { libraryModel, libraryTrack } from './helpers/libraryModel.js';

function setup() {
  const { connection } = libraryModel();
  const repo = new MongoLibraryRepository(connection);
  const music = {
    info: vi.fn(async () => libraryTrack),
    currentTrack: vi.fn(() => libraryTrack),
    collection: vi.fn(async () => ({
      id: 'youtube:mix',
      title: 'Mix',
      sourceProvider: 'youtube-sr',
      sourceId: 'mix',
      tracks: [
        libraryTrack,
        { ...libraryTrack, sourceId: 'bcdefghijkl', title: 'Second' },
      ],
      importSummary: {
        total: 4,
        imported: 2,
        skipped: 1,
        failed: 1,
        truncated: false,
        partial: true,
      },
    })),
    playTracks: vi.fn(async () => ({ queued: 2 })),
  };
  return {
    repo,
    music,
    service: new LibraryService(repo, music as unknown as MusicService),
  };
}
const target = {
  guildId: 'guild',
  channelId: 'voice',
  adapterCreator: (() => ({})) as never,
};
describe('library orchestration', () => {
  it('resolves add/import through MusicService and preserves import ordering/statistics', async () => {
    const { repo, music, service } = setup();
    await service.create('alice', 'Mix');
    await service.add('alice', 'Mix', 'query', 'guild');
    expect(music.info).toHaveBeenCalledWith('query', 'guild', 'alice');
    const imported = await service.importCollection(
      'alice',
      'Mix',
      'https://example.invalid',
      'guild',
    );
    expect(imported).toMatchObject({
      imported: 1,
      skipped: 2,
      failed: 1,
      total: 4,
    });
    expect(
      (await repo.get('alice', 'mix')).entries.map((e) => e.track.title),
    ).toEqual(['Song', 'Second']);
    expect(music.playTracks).not.toHaveBeenCalled();
    await service.play('alice', 'Mix', target);
    expect(music.playTracks).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'alice',
        tracks: [
          expect.objectContaining({ title: 'Song' }),
          expect.objectContaining({ title: 'Second' }),
        ],
      }),
    );
  });
  it('likes/unlikes current and query tracks without duplicates and persists across service reconstruction', async () => {
    const { repo, music, service } = setup();
    expect((await service.like('alice', 'guild')).added).toBe(true);
    const newer = new LibraryService(repo, music as unknown as MusicService);
    expect((await newer.like('alice', 'guild', 'query')).added).toBe(false);
    expect(await newer.dislike('alice', 'guild')).toBe(true);
    expect(await newer.dislike('alice', 'guild', 'query')).toBe(false);
    await expect(newer.playLiked('alice', target)).rejects.toMatchObject({
      code: 'LIKED_SONGS_EMPTY',
    });
    await newer.like('alice', 'guild');
    await newer.playLiked('alice', target);
    expect(music.playTracks).toHaveBeenCalledOnce();
    expect((await newer.liked('bob')).entries).toEqual([]);
  });
  it('paginates deterministic data and rejects out-of-range pages', () => {
    expect(
      libraryPage(
        Array.from({ length: 21 }, (_, i) => i),
        2,
        10,
      ),
    ).toMatchObject({
      items: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      pages: 3,
      page: 2,
    });
    expect(libraryPage([], 1)).toMatchObject({ items: [], pages: 1 });
    for (const p of [0, -1, 3, 1.5])
      expect(() => libraryPage([1], p)).toThrow();
  });
  it('retains metadata-origin identity for matched current tracks', () => {
    expect(
      trackIdentity({
        ...libraryTrack,
        provenance: {
          originalSourceProvider: 'spotify',
          originalSourceId: 'spotify-id',
        },
      }),
    ).toBe('spotify:spotify-id');
  });
});

it('validates import names before provider requests or persistence', async () => {
  const { service, music, repo } = setup();
  await expect(
    service.importCollection('alice', 'bad\nname', 'url', 'guild'),
  ).rejects.toMatchObject({ code: 'PLAYLIST_NAME_INVALID' });
  expect(music.collection).not.toHaveBeenCalled();
  expect(await repo.list('alice')).toEqual([]);
});

it('saves ordered library snapshots and selected tracks without resolving metadata or streams', async () => {
  const { service, music, repo } = setup();
  await service.like('alice', 'guild');
  music.info.mockClear();
  const liked = await service.liked('alice');
  const copy = await service.saveCollection(
    'alice',
    { kind: 'liked' },
    'Saved favorites',
  );
  expect(copy.entries[0]?.fingerprint).toBe(liked.entries[0]?.fingerprint);
  await service.unlikeSaved('alice', liked.entries[0]!.track);
  expect((await service.liked('alice')).entries).toEqual([]);
  expect((await service.get('alice', 'Saved favorites')).entries).toHaveLength(
    1,
  );
  expect((await service.likeSaved('alice', copy.entries[0]!.track)).added).toBe(
    true,
  );
  await service.create('alice', 'Destination');
  await service.addSaved('alice', 'Destination', copy.entries[0]!.track);
  await service.removeEntry(
    'alice',
    'Destination',
    (await service.get('alice', 'Destination')).entries[0]!.id,
  );
  const saved = await service.saveCollection(
    'alice',
    { kind: 'playlist', name: 'Saved favorites' },
    'Copy',
  );
  expect(saved.entries[0]?.track.title).toBe('Song');
  await expect(
    service.saveCollection('bob', { kind: 'playlist', name: 'Copy' }, 'Stolen'),
  ).rejects.toMatchObject({ code: 'PLAYLIST_NOT_FOUND' });
  expect(music.info).not.toHaveBeenCalled();
  expect(music.playTracks).not.toHaveBeenCalled();
  expect((await repo.get('alice', 'Copy')).entries).toHaveLength(1);
});

it('saves a resolved info track with origin identity and duplicate protection without a second search', async () => {
  const { service, repo, music } = setup();
  const track = {
    ...libraryTrack,
    provenance: {
      input: 'search',
      parsedBy: 'youtube-sr',
      originalSourceProvider: 'spotify',
      originalSourceId: 'original-song',
    },
  };
  expect((await service.likeSaved('alice', track)).added).toBe(true);
  const reconstructed = new LibraryService(
    repo,
    music as unknown as MusicService,
  );
  expect((await reconstructed.likeSaved('alice', track)).added).toBe(false);
  const saved = await reconstructed.liked('alice');
  expect(saved.entries).toHaveLength(1);
  expect(saved.entries[0]).toMatchObject({
    fingerprint: 'spotify:original-song',
    track: {
      title: 'Song',
      originProvider: 'spotify',
      originId: 'original-song',
    },
  });
  expect((await reconstructed.liked('bob')).entries).toEqual([]);
  expect(music.info).not.toHaveBeenCalled();
  expect(music.playTracks).not.toHaveBeenCalled();
});
