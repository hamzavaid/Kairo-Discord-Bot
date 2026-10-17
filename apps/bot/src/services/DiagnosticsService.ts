import type { KairoMusicEngine } from '@kairo/music-engine';
import type { StartupResult } from '../bootstrap/reliability.js';
export class DiagnosticsService {
  private phase: 'starting' | 'ready' | 'stopping' | 'stopped' = 'starting';
  private checks: StartupResult[] = [];
  constructor(
    private readonly engine: Pick<
      KairoMusicEngine,
      'getHealth' | 'getPlayback' | 'getQueue'
    >,
    private readonly database: () => Promise<{
      status: 'healthy' | 'unavailable';
    }>,
    private readonly discordReady: () => boolean,
  ) {}
  ready(checks: StartupResult[]) {
    this.checks = checks.map((c) => ({ ...c }));
    this.phase = 'ready';
  }
  stopping() {
    this.phase = 'stopping';
  }
  stopped() {
    this.phase = 'stopped';
  }
  async health() {
    const engine = this.engine.getHealth();
    let database: 'healthy' | 'unavailable' = 'unavailable';
    try {
      database = (await this.database()).status;
    } catch {
      /* Preserve safe health state. */
    }
    const ready =
      this.phase === 'ready' &&
      this.discordReady() &&
      database === 'healthy' &&
      engine.status !== 'closed';
    return {
      live: this.phase !== 'stopped',
      ready,
      phase: this.phase,
      status: !ready
        ? 'unavailable'
        : engine.status === 'degraded' ||
            this.checks.some((c) => c.status !== 'ok')
          ? 'degraded'
          : 'healthy',
      database,
      resources: engine.resources,
      checks: this.checks.map((c) => ({ ...c })),
    };
  }
  providers() {
    return this.engine.getHealth().providers;
  }
  metrics() {
    return this.engine.getHealth().metrics;
  }
  session(guildId: string): {
    state: string;
    generation: number;
    queued: number;
    current: boolean;
    preview: boolean;
    repeat: string;
    volume: number;
  } {
    const playback = this.engine.getPlayback(guildId),
      queue = this.engine.getQueue(guildId);
    return {
      state: playback.state,
      generation: playback.generation,
      queued: queue.upcoming.length,
      current: Boolean(queue.current),
      preview: playback.previewActive ?? false,
      repeat: queue.repeatMode,
      volume: playback.volume ?? 0,
    };
  }
}
