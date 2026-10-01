import { describe, expect, it } from 'vitest';
import {
  MongoLibraryRepository,
  saveTrack,
  trackIdentity,
} from '../packages/data/src/LibraryRepository.js';
import { libraryModel, libraryTrack } from './helpers/libraryModel.js';

describe('Mongo library persistence', () => {
  it('normalizes owner-scoped names and survives repository reconstruction', async () => {
    const { connection } = libraryModel();
    const repo = new MongoLibraryRepository(connection);
    const playlist = await repo.create('alice', '  Night   Drive  ');
    expect(playlist.name).toBe('Night Drive');
    await expect(
      repo.create('alice', 'ＮＩＧＨＴ drive'),
    ).rejects.toMatchObject({ code: 'PLAYLIST_ALREADY_EXISTS' });
    await repo.create('bob', 'night drive');
    expect(
      (await new MongoLibraryRepository(connection).get('alice', 'NIGHT DRIVE'))
        .id,
    ).toBe(playlist.id);
    expect(await repo.list('alice')).toHaveLength(1);
    await expect(repo.get('eve', 'night drive')).rejects.toMatchObject({
      code: 'PLAYLIST_NOT_FOUND',
    });
    for (const name of ['', 'x'.repeat(65), 'bad\nname', 'Liked Songs'])
      await expect(repo.create('alice', name)).rejects.toMatchObject({
        code: 'PLAYLIST_NAME_INVALID',
      });
  });
  it('preserves ordered entries, deduplicates concurrent appends, and enforces limits', async () => {
    const { connection } = libraryModel();
    const repo = new MongoLibraryRepository(connection, { maxEntries: 2 });
    await repo.create('alice', 'mix');
    const a = saveTrack(libraryTrack);
    const b = saveTrack({
      ...libraryTrack,
      sourceId: 'bcdefghijkl',
      title: 'Second',
    });
    await Promise.all([
      repo.append('alice', 'mix', [a]),
      repo.append('alice', 'mix', [a]),
    ]);
    await repo.append('alice', 'mix', [b]);
    expect(
      (await repo.get('alice', 'mix')).entries.map((e) => e.track.title),
    ).toEqual(['Song', 'Second']);
    await expect(
      repo.append('alice', 'mix', [
        saveTrack({ ...libraryTrack, sourceId: 'cdefghijklm' }),
      ]),
    ).rejects.toMatchObject({ code: 'PLAYLIST_FULL' });
    await expect(repo.remove('alice', 'mix', 0)).rejects.toMatchObject({
      code: 'INVALID_PLAYLIST_POSITION',
    });
    await repo.move('alice', 'mix', 2, 1);
    await repo.rename('alice', 'mix', 'New mix');
    expect(
      (await repo.remove('alice', 'new mix', 1)).entries[0]?.track.title,
    ).toBe('Song');
    await repo.delete('alice', 'new mix');
    await expect(repo.get('alice', 'new mix')).rejects.toMatchObject({
      code: 'PLAYLIST_NOT_FOUND',
    });
  });
  it('stores liked songs as a system collection, with unique identity and stable timestamps', async () => {
    const { connection } = libraryModel();
    const first = new MongoLibraryRepository(connection);
    const track = saveTrack(libraryTrack);
    expect((await first.liked('alice')).entries).toEqual([]);
    const results = await Promise.all([
      first.like('alice', track),
      first.like('alice', track),
    ]);
    expect(results.filter((r) => r.added)).toHaveLength(1);
    const second = new MongoLibraryRepository(connection);
    expect((await second.liked('alice')).entries[0]?.addedAt).toBeInstanceOf(
      Date,
    );
    expect((await second.liked('bob')).entries).toEqual([]);
    expect(await second.unlike('alice', trackIdentity(track))).toBe(true);
    expect(await second.unlike('alice', trackIdentity(track))).toBe(false);
    await second.like('alice', track);
    await second.clearLiked('alice');
    expect((await second.liked('alice')).entries).toEqual([]);
  });
  it('shares YouTube identity and rejects raw or ephemeral persistence fields', () => {
    expect(trackIdentity(libraryTrack)).toBe(
      trackIdentity({ ...libraryTrack, sourceProvider: 'youtube-api' }),
    );
    expect(trackIdentity(libraryTrack)).not.toBe(
      trackIdentity({ ...libraryTrack, sourceId: 'bcdefghijkl' }),
    );
    const saved = saveTrack({
      ...libraryTrack,
      canonicalUrl: 'https://secret.invalid/?token=secret',
      raw: { secret: true },
    });
    expect(JSON.stringify(saved)).not.toContain('secret');
    expect(saved.canonicalUrl).toBe(
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
    expect(() => saveTrack({ ...libraryTrack, artists: [] })).toThrow();
    const noId = { ...libraryTrack, sourceId: undefined };
    expect(trackIdentity(noId)).toBe(
      trackIdentity({ ...noId, title: ' SONG ' }),
    );
  });
});

it('rejects stale destructive confirmations without deleting new data', async () => {
  const { connection } = libraryModel();
  const repo = new MongoLibraryRepository(connection);
  const first = await repo.create('alice', 'Mix');
  await repo.delete('alice', 'Mix');
  await repo.create('alice', 'Mix');
  await expect(repo.delete('alice', 'Mix', first)).rejects.toMatchObject({
    code: 'LIBRARY_CHANGED',
  });
  const liked = await repo.liked('alice');
  await repo.like('alice', saveTrack(libraryTrack));
  await expect(repo.clearLiked('alice', liked)).rejects.toMatchObject({
    code: 'LIBRARY_CHANGED',
  });
  expect((await repo.liked('alice')).entries).toHaveLength(1);
  const playlist = await repo.get('alice', 'Mix');
  await repo.append('alice', 'Mix', [saveTrack(libraryTrack)]);
  await expect(repo.clear('alice', 'Mix', playlist)).rejects.toMatchObject({
    code: 'LIBRARY_CHANGED',
  });
  expect((await repo.get('alice', 'Mix')).entries).toHaveLength(1);
});

it('recovers a concurrent first-like upsert race from the owner unique index', async () => {
  const { connection, model } = libraryModel();
  const repo = new MongoLibraryRepository(connection);
  await repo.liked('alice');
  model.findOneAndUpdate.mockImplementationOnce(
    () =>
      ({
        exec: async () => {
          throw Object.assign(new Error('duplicate'), { code: 11000 });
        },
      }) as never,
  );
  expect((await repo.liked('alice')).ownerUserId).toBe('alice');
});
