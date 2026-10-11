import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  MongoGuildSettingsRepository,
  normalizeGuildControls,
} from '../packages/data/src/GuildSettingsRepository.js';
import {
  MongoHistoryRepository,
  MongoAuditRepository,
} from '../packages/data/src/HistoryRepository.js';
import { MongoLibraryRepository } from '../packages/data/src/LibraryRepository.js';
import { libraryTrack } from './helpers/libraryModel.js';
const enabled = process.env.KAIRO_LIVE_PHASE8_TESTS === '1';
describe.skipIf(!enabled)('isolated real MongoDB advanced persistence', () => {
  it('reconstructs defaults, history, audits and Phase 7 libraries using additive collections', async () => {
    if (!process.env.MONGODB_URI) process.loadEnvFile('.env');
    const dbName = `kairo_p8_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const first = await mongoose
      .createConnection(process.env.MONGODB_URI!, {
        dbName,
        serverSelectionTimeoutMS: 5000,
      })
      .asPromise();
    try {
      const settings = new MongoGuildSettingsRepository(first);
      const history = new MongoHistoryRepository(first);
      const audit = new MongoAuditRepository(first);
      const library = new MongoLibraryRepository(first);
      await Promise.all([
        first.model('GuildSettings').init(),
        history.initialize(),
        audit.initialize(),
        library.initialize(),
      ]);
      await settings.setAudioQuality('guild', 'best');
      await settings.setControls!('guild', {
        volume: 30,
        autoplay: true,
        repeat: 'queue',
        filter: 'speech',
        controlPolicy: 'dj',
        djRoleId: '123456789012345678',
      });
      await library.create('u', 'Still here');
      const entry = {
        attemptId: 'attempt',
        guildId: 'guild',
        userId: 'u',
        track: libraryTrack,
        requestedAt: new Date(),
        startedAt: new Date(),
        source: 'manual' as const,
        status: 'completed' as const,
        endedAt: new Date(),
        listenedMs: 1200,
      };
      await Promise.all([history.record(entry), history.record(entry)]);
      await history.record({ ...entry, status: 'playing', listenedMs: 0 });
      await audit.record({
        command: 'volume',
        userId: 'u',
        guildId: 'guild',
        timestamp: new Date().toISOString(),
        success: true,
        durationMs: 20,
      });
      const second = await mongoose
        .createConnection(process.env.MONGODB_URI!, {
          dbName,
          serverSelectionTimeoutMS: 5000,
        })
        .asPromise();
      try {
        const restored = await new MongoGuildSettingsRepository(second).get(
          'guild',
        );
        expect(restored.audioQuality).toBe('best');
        expect(normalizeGuildControls(restored.controls)).toMatchObject({
          volume: 30,
          autoplay: true,
          repeat: 'queue',
          filter: 'speech',
          controlPolicy: 'dj',
        });
        const rows = await new MongoHistoryRepository(second).list({
          userId: 'u',
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          status: 'completed',
          listenedMs: 1200,
        });
        expect(
          await new MongoHistoryRepository(second).list({ userId: 'other' }),
        ).toEqual([]);
        expect(await new MongoAuditRepository(second).list()).toHaveLength(1);
        expect(await new MongoLibraryRepository(second).list('u')).toHaveLength(
          1,
        );
      } finally {
        await second.close();
      }
    } finally {
      // Only this test's unique database is deleted; existing guild data is never touched.
      try {
        await first.dropDatabase();
      } finally {
        await first.close();
      }
    }
  }, 30000);
});
