import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  VoiceConnectionDisconnectReason,
  type VoiceConnection,
} from '@discordjs/voice';
import { MusicError } from '../api/errors.js';
import type { VoiceTarget } from '../api/playback.js';
import { WorkScope } from '@kairo/shared';
import { setTimeout as delay } from 'node:timers/promises';

export interface VoiceManagerOptions {
  join?: typeof joinVoiceChannel;
  waitReady?: (connection: VoiceConnection) => Promise<VoiceConnection>;
  timeoutMs?: number;
  onDisconnect?: (guildId: string) => void;
  recoveryAttempts?: number;
  recoveryTimeoutMs?: number;
  retryDelayMs?: number;
  onRecovery?: (
    guildId: string,
    state: 'attempt' | 'recovering' | 'recovered' | 'failed',
  ) => void;
}

export class VoiceManager {
  private readonly connections = new Map<string, VoiceConnection>();
  private readonly pending = new Map<string, Promise<VoiceConnection>>();
  private readonly aborts = new Map<string, AbortController>();
  private readonly recovering = new Set<string>();
  private readonly scope = new WorkScope(15_000);
  private closing = false;
  private readonly join: typeof joinVoiceChannel;
  private readonly waitReady: (
    connection: VoiceConnection,
  ) => Promise<VoiceConnection>;

  constructor(private readonly options: VoiceManagerOptions = {}) {
    this.join = options.join ?? joinVoiceChannel;
    this.waitReady =
      options.waitReady ??
      ((connection) =>
        entersState(
          connection,
          VoiceConnectionStatus.Ready,
          options.timeoutMs ?? 15_000,
        ));
  }

  connect(target: VoiceTarget): Promise<VoiceConnection> {
    if (this.closing)
      return Promise.reject(
        new MusicError('VOICE_JOIN_ERROR', 'Voice is shutting down.'),
      );
    const pending = this.pending.get(target.guildId);
    if (pending) return pending;
    const work = this.connectOnce(target);
    this.pending.set(target.guildId, work);
    void work
      .finally(() => {
        if (this.pending.get(target.guildId) === work)
          this.pending.delete(target.guildId);
      })
      .catch(() => {});
    return work;
  }
  private async connectOnce(target: VoiceTarget): Promise<VoiceConnection> {
    if (!target.guildId || !target.channelId || !target.adapterCreator)
      throw new MusicError(
        'VOICE_JOIN_ERROR',
        'A guild voice channel is required.',
      );
    const existing = this.connections.get(target.guildId);
    if (existing) return existing;
    let connection: VoiceConnection | undefined;
    const abort = new AbortController();
    this.aborts.set(target.guildId, abort);
    try {
      connection = this.join({
        guildId: target.guildId,
        channelId: target.channelId,
        adapterCreator: target.adapterCreator,
        selfDeaf: true,
      });
      this.connections.set(target.guildId, connection);
      await this.scope.run(
        () => this.waitReady(connection!),
        abort.signal,
        this.options.timeoutMs ?? 15_000,
      );
    } catch {
      this.finish(target.guildId, connection, false);
      throw new MusicError(
        'VOICE_JOIN_ERROR',
        'Could not join the voice channel.',
        true,
      );
    }
    if (!connection)
      throw new MusicError(
        'VOICE_JOIN_ERROR',
        'Could not join the voice channel.',
        true,
      );
    if (this.closing || abort.signal.aborted) {
      this.finish(target.guildId, connection, false);
      throw new MusicError('VOICE_JOIN_ERROR', 'Voice join was cancelled.');
    }
    connection.on('stateChange', (_oldState, newState) => {
      if (
        (newState.status === VoiceConnectionStatus.Disconnected ||
          newState.status === VoiceConnectionStatus.Destroyed) &&
        this.connections.get(target.guildId) === connection
      ) {
        const transient =
          newState.status === VoiceConnectionStatus.Disconnected &&
          ((newState.reason ===
            VoiceConnectionDisconnectReason.WebSocketClose &&
            newState.closeCode !== 4014) ||
            newState.reason ===
              VoiceConnectionDisconnectReason.EndpointRemoved);
        if (transient && typeof connection.rejoin === 'function')
          this.recover(target.guildId, connection);
        else this.finish(target.guildId, connection, true);
      }
    });
    connection.on('error', () => this.finish(target.guildId, connection, true));
    return connection;
  }

  private finish(
    guildId: string,
    connection: VoiceConnection | undefined,
    notify: boolean,
  ) {
    if (connection && this.connections.get(guildId) !== connection) return;
    this.connections.delete(guildId);
    this.aborts.get(guildId)?.abort();
    this.aborts.delete(guildId);
    this.recovering.delete(guildId);
    if (
      connection &&
      connection.state?.status !== VoiceConnectionStatus.Destroyed
    ) {
      try {
        connection.destroy();
      } catch {
        /* Already destroyed concurrently. */
      }
    }
    if (notify) this.options.onDisconnect?.(guildId);
  }
  private recover(guildId: string, connection: VoiceConnection) {
    if (this.recovering.has(guildId) || this.closing) return;
    this.recovering.add(guildId);
    const abort = this.aborts.get(guildId)!;
    this.options.onRecovery?.(guildId, 'recovering');
    void (async () => {
      for (
        let attempt = 0;
        attempt < (this.options.recoveryAttempts ?? 2);
        attempt++
      ) {
        if (
          abort.signal.aborted ||
          this.connections.get(guildId) !== connection
        )
          return;
        try {
          this.options.onRecovery?.(guildId, 'attempt');
          if (attempt)
            await delay(
              (this.options.retryDelayMs ?? 250) * 2 ** (attempt - 1),
              undefined,
              { signal: abort.signal },
            );
          if (!connection.rejoin()) continue;
          await this.scope.run(
            () => this.waitReady(connection),
            abort.signal,
            this.options.recoveryTimeoutMs ?? 3000,
          );
          if (
            abort.signal.aborted ||
            this.connections.get(guildId) !== connection
          )
            return;
          this.options.onRecovery?.(guildId, 'recovered');
          return;
        } catch {
          if (abort.signal.aborted) return;
        }
      }
      if (this.connections.get(guildId) === connection) {
        this.options.onRecovery?.(guildId, 'failed');
        this.finish(guildId, connection, true);
      }
    })()
      .finally(() => this.recovering.delete(guildId))
      .catch(() => this.finish(guildId, connection, true));
  }

  snapshot() {
    return {
      active: this.connections.size,
      recovering: this.recovering.size,
      joining: this.pending.size,
    };
  }

  get(guildId: string): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  async disconnect(guildId: string): Promise<void> {
    const connection = this.connections.get(guildId);
    this.aborts.get(guildId)?.abort();
    if (connection) this.finish(guildId, connection, false);
  }

  async shutdown(): Promise<void> {
    this.closing = true;
    this.scope.close();
    for (const guildId of [...this.connections.keys()])
      await this.disconnect(guildId);
  }
}
