import { MusicError } from '../api/errors.js';
import type { QueueEntry, QueueSnapshot, RepeatMode } from '../api/queue.js';
import { QueueMutex } from './QueueMutex.js';

export class GuildQueue {
  readonly mutex = new QueueMutex();
  current: QueueEntry | undefined;
  upcoming: QueueEntry[] = [];
  history: QueueEntry[] = [];
  repeatMode: RepeatMode = 'off';
  generation = 0;

  constructor(readonly guildId: string) {}

  snapshot(): QueueSnapshot {
    return {
      guildId: this.guildId,
      ...(this.current
        ? { current: structuredClone(this.current) }
        : { current: undefined }),
      upcoming: structuredClone(this.upcoming),
      history: structuredClone(this.history),
      repeatMode: this.repeatMode,
      generation: this.generation,
    };
  }

  enqueue(entries: QueueEntry[], position: 'next' | 'last' = 'last'): void {
    if (!entries.length) return;
    const pending = [...entries];
    if (!this.current) {
      this.current = pending.shift();
      this.generation += 1;
    }
    if (position === 'next') this.upcoming.unshift(...pending);
    else this.upcoming.push(...pending);
  }

  advance(expectedGeneration: number, cause: 'skip' | 'track-ended'): boolean {
    if (!this.current || expectedGeneration !== this.generation) return false;
    const finished = this.current;
    if (cause === 'track-ended' && this.repeatMode === 'track') {
      this.generation += 1;
      return true;
    }
    this.history.push(finished);
    if (this.history.length > 100) this.history.shift();
    if (cause === 'track-ended' && this.repeatMode === 'queue')
      this.upcoming.push(finished);
    this.current = this.upcoming.shift();
    this.generation += 1;
    return true;
  }

  previous(): void {
    const entry = this.history.pop();
    if (!entry)
      throw new MusicError('QUEUE_EMPTY', 'No previous track is available.');
    if (this.current) this.upcoming.unshift(this.current);
    this.current = entry;
    this.generation += 1;
  }

  clear(): void {
    this.upcoming = [];
  }

  stop(): void {
    this.current = undefined;
    this.upcoming = [];
    this.history = [];
    this.generation += 1;
  }

  remove(position: number): void {
    this.assertPosition(position);
    this.upcoming.splice(position - 1, 1);
  }

  move(from: number, to: number): void {
    this.assertPosition(from);
    this.assertPosition(to);
    const [entry] = this.upcoming.splice(from - 1, 1);
    this.upcoming.splice(to - 1, 0, entry!);
  }

  shuffle(random: () => number): void {
    for (let index = this.upcoming.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [this.upcoming[index], this.upcoming[other]] = [
        this.upcoming[other]!,
        this.upcoming[index]!,
      ];
    }
  }

  private assertPosition(position: number): void {
    if (
      !Number.isInteger(position) ||
      position < 1 ||
      position > this.upcoming.length
    )
      throw new MusicError(
        'INVALID_QUEUE_POSITION',
        'Choose a valid upcoming queue position.',
      );
  }
}
