import { describe, expect, it } from 'vitest';
import { createKairoMusicEngine, type Track } from '@kairo/music-engine';
import { QueueManager } from '../packages/music-engine/src/queue/QueueManager.js';

const track = (id: string): Track => ({
  id: `fixture:${id}`,
  sourceId: id,
  sourceProvider: 'fixture',
  title: id,
  artists: [{ name: 'Fixture' }],
  isLive: false,
  requestedBy: 'user',
  provenance: { input: id, parsedBy: 'fixture' },
  createdAt: new Date('2026-01-01'),
});
const guildId = 'guild-queue';

describe('Phase 4 public queue API', () => {
  it('enqueues FIFO, snapshots safely, and clears upcoming without changing current', async () => {
    const engine = createKairoMusicEngine({ fixtureTracks: [] });
    const first = await engine.enqueueMany({
      guildId,
      tracks: [track('a'), track('b'), track('c')],
      enqueuedBy: 'user',
    });
    expect(first.current?.track.id).toBe('fixture:a');
    expect(first.upcoming.map((entry) => entry.track.id)).toEqual([
      'fixture:b',
      'fixture:c',
    ]);
    first.current!.track.title = 'mutated';
    expect(engine.getQueue(guildId).current?.track.title).toBe('a');
    expect((await engine.clear(guildId)).upcoming).toEqual([]);
    expect(engine.getQueue(guildId).current?.track.id).toBe('fixture:a');
    await engine.shutdown();
  });

  it('supports remove and move with typed one-based position validation', async () => {
    const engine = createKairoMusicEngine();
    await engine.enqueueMany({
      guildId,
      tracks: [track('a'), track('b'), track('c'), track('d')],
      enqueuedBy: 'user',
    });
    expect(
      (await engine.move({ guildId, from: 3, to: 1 })).upcoming.map(
        (entry) => entry.track.sourceId,
      ),
    ).toEqual(['d', 'b', 'c']);
    expect(
      (await engine.remove({ guildId, position: 2 })).upcoming.map(
        (entry) => entry.track.sourceId,
      ),
    ).toEqual(['d', 'c']);
    await expect(engine.remove({ guildId, position: 0 })).rejects.toMatchObject(
      { code: 'INVALID_QUEUE_POSITION' },
    );
    await expect(
      engine.move({ guildId, from: 99, to: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_QUEUE_POSITION' });
  });

  it('shuffles upcoming only and preserves each entry exactly once', async () => {
    const manager = new QueueManager({ random: () => 0 });
    await manager.enqueueMany(
      guildId,
      [track('a'), track('b'), track('c'), track('d')],
      'user',
    );
    const before = manager.snapshot(guildId);
    const after = await manager.shuffle(guildId);
    expect(after.current?.id).toBe(before.current?.id);
    expect(after.upcoming.map((entry) => entry.track.id)).not.toEqual(
      before.upcoming.map((entry) => entry.track.id),
    );
    expect(new Set(after.upcoming.map((entry) => entry.id))).toEqual(
      new Set(before.upcoming.map((entry) => entry.id)),
    );
  });

  it('honors repeat-track on natural end, but skip advances, and supports previous', async () => {
    const manager = new QueueManager();
    await manager.enqueueMany(guildId, [track('a'), track('b')], 'user');
    await manager.setRepeat(guildId, 'track');
    const first = manager.snapshot(guildId);
    const repeated = await manager.advance(
      guildId,
      first.generation,
      'track-ended',
    );
    expect(repeated.current?.id).toBe(first.current?.id);
    expect(repeated.generation).not.toBe(first.generation);
    const skipped = await manager.advance(guildId, repeated.generation, 'skip');
    expect(skipped.current?.track.sourceId).toBe('b');
    expect(skipped.history.map((entry) => entry.track.sourceId)).toEqual(['a']);
    const previous = await manager.previous(guildId);
    expect(previous.current?.track.sourceId).toBe('a');
    expect(previous.upcoming[0]?.track.sourceId).toBe('b');
  });

  it('cycles repeat-queue and resets state on stop', async () => {
    const manager = new QueueManager();
    await manager.enqueueMany(guildId, [track('a'), track('b')], 'user');
    await manager.setRepeat(guildId, 'queue');
    let state = manager.snapshot(guildId);
    state = await manager.advance(guildId, state.generation, 'track-ended');
    expect(state.current?.track.sourceId).toBe('b');
    expect(state.upcoming[0]?.track.sourceId).toBe('a');
    state = await manager.advance(guildId, state.generation, 'track-ended');
    expect(state.current?.track.sourceId).toBe('a');
    const stopped = await manager.stop(guildId);
    expect(stopped).toMatchObject({
      current: undefined,
      upcoming: [],
      history: [],
    });
    expect((await manager.stop(guildId)).current).toBeUndefined();
  });

  it('advances exactly once for concurrent skip and track-end observations', async () => {
    const manager = new QueueManager();
    await manager.enqueueMany(
      guildId,
      [track('a'), track('b'), track('c')],
      'user',
    );
    const generation = manager.snapshot(guildId).generation;
    const [skip, ended] = await Promise.all([
      manager.advance(guildId, generation, 'skip'),
      manager.advance(guildId, generation, 'track-ended'),
    ]);
    expect(skip.current?.track.sourceId).toBe('b');
    expect(ended.current?.track.sourceId).toBe('b');
    expect(
      manager.snapshot(guildId).upcoming.map((entry) => entry.track.sourceId),
    ).toEqual(['c']);
  });

  it('invalidates a stale track-end after stop and isolates guild queues', async () => {
    const manager = new QueueManager();
    await manager.enqueueMany(guildId, [track('a'), track('b')], 'user');
    await manager.enqueueMany('other-guild', [track('x')], 'user');
    const generation = manager.snapshot(guildId).generation;
    await manager.stop(guildId);
    const stale = await manager.advance(guildId, generation, 'track-ended');
    expect(stale.current).toBeUndefined();
    expect(stale.upcoming).toEqual([]);
    expect(manager.snapshot('other-guild').current?.track.sourceId).toBe('x');
  });

  it('enforces the queue limit atomically and supports removal by entry ID', async () => {
    const manager = new QueueManager({ maxEntries: 2 });
    const first = await manager.enqueueMany(
      guildId,
      [track('a'), track('b')],
      'user',
    );
    await expect(
      manager.enqueueMany(guildId, [track('c')], 'user'),
    ).rejects.toMatchObject({ code: 'QUEUE_LIMIT' });
    expect(
      manager.snapshot(guildId).upcoming.map((entry) => entry.track.sourceId),
    ).toEqual(['b']);
    const removed = await manager.remove({
      guildId,
      entryId: first.upcoming[0]!.id,
    });
    expect(removed.upcoming).toEqual([]);
  });
});
