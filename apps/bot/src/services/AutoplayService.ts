import {
  normalizeGuildControls,
  type GuildSettingsRepository,
} from '@kairo/data';
import type { KairoMusicEngine, Track } from '@kairo/music-engine';
import { CommandError } from '../errors.js';
import type { RecommendationService } from './RecommendationService.js';
import { WorkScope } from '@kairo/shared';
export class AutoplayService {
  private readonly jobs = new Map<
    string,
    { abort: AbortController; work: Promise<void> }
  >();
  private readonly subscriptions: (() => void)[] = [];
  private closing = false;
  private readonly scope = new WorkScope(10_000, 16);
  constructor(
    private readonly engine: KairoMusicEngine,
    private readonly settings: GuildSettingsRepository,
    private readonly recommendations: RecommendationService,
    private readonly report: (error: unknown) => void = () => {},
    private readonly canPlay: (guildId: string) => boolean = () => true,
  ) {}
  attach() {
    this.subscriptions.push(
      this.engine.on('queueExhausted', (e) => {
        if (
          this.closing ||
          this.jobs.has(e.guildId) ||
          e.cause === 'stream-failed'
        )
          return;
        const abort = new AbortController();
        const work = Promise.resolve()
          .then(() =>
            this.scope.run(
              () => this.fill(e.guildId, e.generation, e.seed, e.userId, abort),
              abort.signal,
            ),
          )
          .catch((error) => {
            if (!abort.signal.aborted) {
              try {
                this.report(error);
              } catch {
                /* Optional logging must not reject a background job. */
              }
            }
          })
          .finally(() => {
            if (this.jobs.get(e.guildId)?.abort === abort)
              this.jobs.delete(e.guildId);
          });
        this.jobs.set(e.guildId, { abort, work });
      }),
    );
    this.subscriptions.push(
      this.engine.on('playbackStateChanged', (e) => {
        if (e.state === 'DISCONNECTED') this.cancel(e.guildId);
      }),
    );
  }
  cancel(guildId: string) {
    this.jobs.get(guildId)?.abort.abort();
  }
  async settingsChanged(guildId: string) {
    if (
      !normalizeGuildControls((await this.settings.get(guildId)).controls)
        .autoplay
    )
      this.cancel(guildId);
  }
  private async fill(
    guildId: string,
    generation: number,
    seed: Track,
    userId: string,
    abort: AbortController,
  ) {
    if (
      abort.signal.aborted ||
      this.closing ||
      !normalizeGuildControls((await this.settings.get(guildId)).controls)
        .autoplay ||
      !this.canPlay(guildId)
    )
      return;
    const timer = setTimeout(() => abort.abort(), 10000);
    timer.unref();
    try {
      const tracks = await this.recommendations.recommend({
        guildId,
        userId,
        seed,
        signal: abort.signal,
      });
      if (abort.signal.aborted || this.closing || !this.canPlay(guildId))
        return;
      const queue = this.engine.getQueue(guildId);
      if (
        queue.generation !== generation ||
        queue.current ||
        queue.upcoming.length ||
        this.engine.getPlayback(guildId).state === 'DISCONNECTED'
      )
        return;
      // Re-read persisted flag after discovery; disable/stop cannot resurrect radio.
      if (
        !normalizeGuildControls((await this.settings.get(guildId)).controls)
          .autoplay ||
        abort.signal.aborted
      )
        return;
      if (!tracks[0])
        throw new CommandError(
          'RECOMMENDATION_UNAVAILABLE',
          'No fresh radio recommendation was found.',
        );
      await this.engine.enqueueAutoplay({
        guildId,
        track: tracks[0]!,
        enqueuedBy: userId,
        expectedGeneration: generation,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  async drain() {
    await Promise.all([...this.jobs.values()].map((j) => j.work));
  }
  async close() {
    this.closing = true;
    this.scope.close();
    for (const off of this.subscriptions) off();
    for (const job of this.jobs.values()) job.abort.abort();
    await this.drain();
  }
}
