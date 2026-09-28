import { MusicError } from '../api/errors.js';
import type {
  QueueEntry,
  QueueSnapshot,
  RepeatMode,
  RemoveRequest,
  MoveRequest,
} from '../api/queue.js';
import type { Track } from '../domain/Track.js';
import { GuildQueue } from './GuildQueue.js';

export interface QueueManagerOptions {
  random?: () => number;
  maxEntries?: number;
  now?: () => Date;
}

export class QueueManager {
  private readonly queues = new Map<string, GuildQueue>();
  private nextId = 0;
  private readonly random: () => number;
  private readonly maxEntries: number;
  private readonly now: () => Date;

  constructor(options: QueueManagerOptions = {}) {
    this.random = options.random ?? Math.random;
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? (() => new Date());
    if (!Number.isInteger(this.maxEntries) || this.maxEntries < 1)
      throw new MusicError('INVALID_QUERY', 'Queue limit must be positive.');
  }

  private queue(guildId: string): GuildQueue {
    if (!guildId) throw new MusicError('INVALID_QUERY', 'A guild is required.');
    let queue = this.queues.get(guildId);
    if (!queue) {
      queue = new GuildQueue(guildId);
      this.queues.set(guildId, queue);
    }
    return queue;
  }

  snapshot(guildId: string): QueueSnapshot {
    return this.queue(guildId).snapshot();
  }

  async enqueueMany(
    guildId: string,
    tracks: readonly Track[],
    enqueuedBy: string,
  ): Promise<QueueSnapshot> {
    const queue = this.queue(guildId);
    return queue.mutex.runExclusive(() => {
      if (!enqueuedBy)
        throw new MusicError('INVALID_QUERY', 'A requester is required.');
      if (
        tracks.length + queue.upcoming.length + (queue.current ? 1 : 0) >
        this.maxEntries
      )
        throw new MusicError('QUEUE_LIMIT', 'The queue is full.');
      const entries: QueueEntry[] = tracks.map((track) => ({
        id: `qe_${++this.nextId}`,
        track: structuredClone(track),
        enqueuedBy,
        enqueuedAt: this.now(),
      }));
      queue.enqueue(entries);
      return queue.snapshot();
    });
  }

  async advance(
    guildId: string,
    expectedGeneration: number,
    cause: 'skip' | 'track-ended',
  ): Promise<QueueSnapshot> {
    const queue = this.queue(guildId);
    return queue.mutex.runExclusive(() => {
      queue.advance(expectedGeneration, cause);
      return queue.snapshot();
    });
  }

  async previous(guildId: string): Promise<QueueSnapshot> {
    const queue = this.queue(guildId);
    return queue.mutex.runExclusive(() => {
      queue.previous();
      return queue.snapshot();
    });
  }

  async clear(guildId: string): Promise<QueueSnapshot> {
    const queue = this.queue(guildId);
    return queue.mutex.runExclusive(() => {
      queue.clear();
      return queue.snapshot();
    });
  }

  async stop(guildId: string): Promise<QueueSnapshot> {
    const queue = this.queue(guildId);
    return queue.mutex.runExclusive(() => {
      queue.stop();
      return queue.snapshot();
    });
  }

  async remove(request: RemoveRequest): Promise<QueueSnapshot> {
    const queue = this.queue(request.guildId);
    return queue.mutex.runExclusive(() => {
      const position =
        request.position ??
        queue.upcoming.findIndex((entry) => entry.id === request.entryId) + 1;
      queue.remove(position);
      return queue.snapshot();
    });
  }

  async move(request: MoveRequest): Promise<QueueSnapshot> {
    const queue = this.queue(request.guildId);
    return queue.mutex.runExclusive(() => {
      queue.move(request.from, request.to);
      return queue.snapshot();
    });
  }

  async shuffle(guildId: string): Promise<QueueSnapshot> {
    const queue = this.queue(guildId);
    return queue.mutex.runExclusive(() => {
      queue.shuffle(this.random);
      return queue.snapshot();
    });
  }

  async setRepeat(guildId: string, mode: RepeatMode): Promise<QueueSnapshot> {
    const queue = this.queue(guildId);
    return queue.mutex.runExclusive(() => {
      if (!['off', 'track', 'queue'].includes(mode))
        throw new MusicError('INVALID_QUERY', 'Choose a valid repeat mode.');
      queue.repeatMode = mode;
      return queue.snapshot();
    });
  }

  shutdown(): void {
    this.queues.clear();
  }
}
