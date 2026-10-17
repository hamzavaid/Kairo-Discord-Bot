import { MusicError } from '../api/errors.js';
/** FIFO async mutex scoped by the owning GuildQueue. */
export class QueueMutex {
  private tail: Promise<void> = Promise.resolve();
  private admitted = 0;
  constructor(private readonly limit = 128) {}
  get busy() {
    return this.admitted > 0;
  }

  async runExclusive<T>(work: () => Promise<T> | T): Promise<T> {
    if (this.admitted >= this.limit)
      throw new MusicError(
        'RESOURCE_BUSY',
        'Too many pending guild mutations.',
        true,
      );
    this.admitted++;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      this.admitted--;
      release();
    }
  }
}
