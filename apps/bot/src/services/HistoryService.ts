import type { HistoryRepository, HistoryScope } from '@kairo/data';
import type { KairoMusicEngine } from '@kairo/music-engine';
/** Serializes durable events; shutdown waits for admitted writes before Mongo closes. */
export class HistoryService {
  private pending = Promise.resolve();
  private unsubscribe?: () => void;
  constructor(
    private readonly repository: HistoryRepository,
    private readonly report: (error: unknown) => void = () => {},
  ) {}
  attach(engine: KairoMusicEngine): void {
    this.unsubscribe?.();
    this.unsubscribe = engine.on('playbackAttempt', (event) => {
      this.pending = this.pending
        .then(() => this.repository.record(event))
        .catch((error) => this.report(error));
    });
  }
  list(scope: HistoryScope, page = 1, limit = 10) {
    return this.repository.list(scope, page, limit);
  }
  recent(scope: HistoryScope, limit = 100) {
    return this.repository.scan(scope, limit);
  }
  async drain() {
    await this.pending;
  }
  async close() {
    this.unsubscribe?.();
    await this.drain();
  }
}
