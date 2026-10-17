import type { HistoryRepository, HistoryScope } from '@kairo/data';
import type { KairoMusicEngine } from '@kairo/music-engine';
import { WriteQueue } from '@kairo/shared';
/** Serializes durable events; shutdown waits for admitted writes before Mongo closes. */
export class HistoryService {
  private readonly writes: WriteQueue;
  private unsubscribe?: () => void;
  constructor(
    private readonly repository: HistoryRepository,
    private readonly report: (error: unknown) => void = () => {},
  ) {
    this.writes = new WriteQueue(512, 2000, report);
  }
  attach(engine: KairoMusicEngine): void {
    this.unsubscribe?.();
    this.unsubscribe = engine.on('playbackAttempt', (event) => {
      this.writes.add(() => this.repository.record(event));
    });
  }
  list(scope: HistoryScope, page = 1, limit = 10) {
    return this.repository.list(scope, page, limit);
  }
  recent(scope: HistoryScope, limit = 100) {
    return this.repository.scan(scope, limit);
  }
  async drain() {
    await this.writes.drain();
  }
  async close() {
    this.unsubscribe?.();
    await this.writes.close();
  }
}
