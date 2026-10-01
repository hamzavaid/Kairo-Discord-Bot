import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { MongoLibraryRepository } from '../packages/data/src/LibraryRepository.js';
import { saveTrack } from '../packages/data/src/LibraryRepository.js';
import { libraryTrack } from './helpers/libraryModel.js';

const enabled = process.env.KAIRO_LIVE_LIBRARY_TESTS === '1';
describe.skipIf(!enabled)('isolated real MongoDB library persistence', () => {
  it('enforces unique indexes, survives a new connection, and keeps owner isolation under races', async () => {
    if (!process.env.MONGODB_URI) process.loadEnvFile('.env');
    const uri = process.env.MONGODB_URI!;
    const dbName = `kairo_p7_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const first = await mongoose
      .createConnection(uri, { dbName, serverSelectionTimeoutMS: 5000 })
      .asPromise();
    try {
      const repo = new MongoLibraryRepository(first);
      await repo.initialize();
      await repo.create('alice', 'mix');
      await expect(repo.create('alice', 'MIX')).rejects.toMatchObject({
        code: 'PLAYLIST_ALREADY_EXISTS',
      });
      const track = saveTrack(libraryTrack);
      await Promise.all([
        repo.append('alice', 'mix', [track]),
        repo.append('alice', 'mix', [track]),
      ]);
      await Promise.all([repo.like('alice', track), repo.like('alice', track)]);
      const second = await mongoose
        .createConnection(uri, { dbName, serverSelectionTimeoutMS: 5000 })
        .asPromise();
      try {
        const reconstructed = new MongoLibraryRepository(second);
        expect((await reconstructed.get('alice', 'mix')).entries).toHaveLength(
          1,
        );
        expect((await reconstructed.liked('alice')).entries).toHaveLength(1);
        await expect(reconstructed.get('bob', 'mix')).rejects.toMatchObject({
          code: 'PLAYLIST_NOT_FOUND',
        });
      } finally {
        await second.close();
      }
    } finally {
      // This unique test-only database was created by this test; no existing database is touched.
      try {
        await first.dropDatabase();
      } finally {
        await first.close();
      }
    }
  }, 30000);
});
