import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type VoiceConnection,
} from '@discordjs/voice';
import { MusicError } from '../api/errors.js';
import type { VoiceTarget } from '../api/playback.js';

export interface VoiceManagerOptions {
  join?: typeof joinVoiceChannel;
  waitReady?: (connection: VoiceConnection) => Promise<VoiceConnection>;
  timeoutMs?: number;
  onDisconnect?: (guildId: string) => void;
}

export class VoiceManager {
  private readonly connections = new Map<string, VoiceConnection>();
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

  async connect(target: VoiceTarget): Promise<VoiceConnection> {
    if (!target.guildId || !target.channelId || !target.adapterCreator)
      throw new MusicError(
        'VOICE_JOIN_ERROR',
        'A guild voice channel is required.',
      );
    const existing = this.connections.get(target.guildId);
    if (existing) return existing;
    let connection: VoiceConnection | undefined;
    try {
      connection = this.join({
        guildId: target.guildId,
        channelId: target.channelId,
        adapterCreator: target.adapterCreator,
        selfDeaf: true,
      });
      await this.waitReady(connection);
    } catch {
      connection?.destroy();
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
    this.connections.set(target.guildId, connection);
    connection.on('stateChange', (_oldState, newState) => {
      if (
        (newState.status === VoiceConnectionStatus.Disconnected ||
          newState.status === VoiceConnectionStatus.Destroyed) &&
        this.connections.get(target.guildId) === connection
      ) {
        this.connections.delete(target.guildId);
        if (newState.status !== VoiceConnectionStatus.Destroyed)
          connection.destroy();
        this.options.onDisconnect?.(target.guildId);
      }
    });
    return connection;
  }

  get(guildId: string): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  async disconnect(guildId: string): Promise<void> {
    const connection = this.connections.get(guildId);
    if (!connection) return;
    this.connections.delete(guildId);
    connection.destroy();
  }

  async shutdown(): Promise<void> {
    for (const guildId of [...this.connections.keys()])
      await this.disconnect(guildId);
  }
}
