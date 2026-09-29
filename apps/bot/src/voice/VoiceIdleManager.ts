import type { GuildSettingsRepository } from '@kairo/data';

export interface VoiceOccupancy {
  channelId: string | undefined;
  humanCount: number;
}

/** Monitors occupancy; it never joins or reconnects a voice channel. */
export class VoiceIdleManager {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly revisions = new Map<string, number>();
  private closed = false;

  constructor(
    private readonly settings: {
      get(
        guildId: string,
      ): Promise<
        Pick<
          Awaited<ReturnType<GuildSettingsRepository['get']>>,
          'idleDisconnectSeconds'
        >
      >;
    },
    private readonly occupancy: (guildId: string) => VoiceOccupancy,
    private readonly disconnect: (guildId: string) => Promise<unknown>,
  ) {}

  cancel(guildId: string): void {
    const timer = this.timers.get(guildId);
    if (timer) clearTimeout(timer);
    this.timers.delete(guildId);
    this.revisions.set(guildId, (this.revisions.get(guildId) ?? 0) + 1);
  }

  async refresh(guildId: string): Promise<void> {
    this.cancel(guildId);
    if (this.closed) return;
    const state = this.occupancy(guildId);
    if (!state.channelId || state.humanCount > 0) return;
    const revision = this.revisions.get(guildId);
    const { idleDisconnectSeconds } = await this.settings.get(guildId);
    if (
      this.closed ||
      this.revisions.get(guildId) !== revision ||
      idleDisconnectSeconds === 0
    )
      return;
    const current = this.occupancy(guildId);
    if (current.channelId !== state.channelId || current.humanCount > 0) return;
    this.timers.set(
      guildId,
      setTimeout(() => {
        this.timers.delete(guildId);
        if (this.closed || this.revisions.get(guildId) !== revision) return;
        const latest = this.occupancy(guildId);
        if (latest.channelId !== state.channelId || latest.humanCount > 0)
          return;
        this.cancel(guildId);
        void this.disconnect(guildId);
      }, idleDisconnectSeconds * 1000),
    );
  }

  shutdown(): void {
    this.closed = true;
    for (const guildId of this.timers.keys()) this.cancel(guildId);
  }
}
