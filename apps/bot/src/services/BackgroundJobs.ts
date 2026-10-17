import { FairLimiter, WorkScope, Metrics } from '@kairo/shared';
type JobKind = 'recommendation' | 'discovery' | 'lyrics' | 'collection';
/** Separate bounded pools avoid nested discovery/recommendation deadlocks. */
export class BackgroundJobs {
  private readonly scope = new WorkScope(20_000, 64);
  private readonly pools: Record<JobKind, FairLimiter>;
  private active = 0;
  constructor(
    private readonly metrics = new Metrics(),
    limit = 4,
  ) {
    this.pools = {
      recommendation: new FairLimiter(limit, 1, 16),
      discovery: new FairLimiter(limit, 1, 16),
      lyrics: new FairLimiter(limit, 1, 16),
      collection: new FairLimiter(2, 1, 16),
    };
  }
  async run<T>(
    kind: JobKind,
    guildId: string,
    work: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.active++;
    this.metrics.set('active_background_jobs', this.active);
    try {
      return await this.scope.run(
        (active) => this.pools[kind].run(guildId, () => work(active), active),
        signal,
      );
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'RESOURCE_BUSY')
          this.metrics.increment('backpressure_rejections_total');
        if (error.code === 'OPERATION_CANCELLED')
          this.metrics.increment('canceled_operations_total');
      }
      throw error;
    } finally {
      this.active--;
      this.metrics.set('active_background_jobs', this.active);
    }
  }
  close() {
    this.scope.close();
    Object.values(this.pools).forEach((pool) => pool.close());
  }
}
