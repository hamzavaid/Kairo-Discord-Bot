import mongoose, { type Connection, type Model } from 'mongoose';

export const DEFAULT_IDLE_DISCONNECT_SECONDS = 60;
export const MAX_IDLE_DISCONNECT_SECONDS = 3600;
export const AUDIO_QUALITIES = ['low', 'medium', 'high', 'best'] as const;
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];
export const DEFAULT_AUDIO_QUALITY: AudioQuality = 'high';

export interface GuildSettings {
  guildId: string;
  idleDisconnectSeconds: number;
  audioQuality: AudioQuality;
}

export interface GuildSettingsRepository {
  get(guildId: string): Promise<GuildSettings>;
  setIdleDisconnectSeconds(
    guildId: string,
    seconds: number,
  ): Promise<GuildSettings>;
  setAudioQuality(
    guildId: string,
    quality: AudioQuality,
  ): Promise<GuildSettings>;
}

export function validateAudioQuality(
  value: string,
): asserts value is AudioQuality {
  if (!AUDIO_QUALITIES.includes(value as AudioQuality))
    throw new RangeError('Audio quality must be low, medium, high, or best.');
}

export function validateIdleDisconnectSeconds(seconds: number): void {
  if (
    !Number.isInteger(seconds) ||
    seconds < 0 ||
    seconds > MAX_IDLE_DISCONNECT_SECONDS
  )
    throw new RangeError(
      `Idle timeout must be an integer from 0 to ${MAX_IDLE_DISCONNECT_SECONDS} seconds.`,
    );
}

const schema = new mongoose.Schema<GuildSettings>(
  {
    guildId: { type: String, required: true, unique: true },
    idleDisconnectSeconds: {
      type: Number,
      required: true,
      default: DEFAULT_IDLE_DISCONNECT_SECONDS,
      min: 0,
      max: MAX_IDLE_DISCONNECT_SECONDS,
    },
    audioQuality: {
      type: String,
      enum: AUDIO_QUALITIES,
      default: DEFAULT_AUDIO_QUALITY,
    },
  },
  { versionKey: false },
);

export class MongoGuildSettingsRepository implements GuildSettingsRepository {
  private readonly model: Model<GuildSettings>;

  constructor(connection: Connection) {
    this.model = connection.model<GuildSettings>('GuildSettings', schema);
  }

  async get(guildId: string): Promise<GuildSettings> {
    const record = await this.model.findOne({ guildId }).lean().exec();
    return {
      guildId,
      idleDisconnectSeconds:
        record?.idleDisconnectSeconds ?? DEFAULT_IDLE_DISCONNECT_SECONDS,
      audioQuality: record?.audioQuality ?? DEFAULT_AUDIO_QUALITY,
    };
  }

  async setIdleDisconnectSeconds(
    guildId: string,
    seconds: number,
  ): Promise<GuildSettings> {
    validateIdleDisconnectSeconds(seconds);
    const record = await this.model
      .findOneAndUpdate(
        { guildId },
        { $set: { idleDisconnectSeconds: seconds } },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          lean: true,
        },
      )
      .exec();
    if (!record) throw new Error('Guild settings write failed.');
    return {
      guildId,
      idleDisconnectSeconds: record.idleDisconnectSeconds,
      audioQuality: record.audioQuality ?? DEFAULT_AUDIO_QUALITY,
    };
  }

  async setAudioQuality(
    guildId: string,
    quality: AudioQuality,
  ): Promise<GuildSettings> {
    validateAudioQuality(quality);
    const record = await this.model
      .findOneAndUpdate(
        { guildId },
        { $set: { audioQuality: quality } },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          lean: true,
        },
      )
      .exec();
    if (!record) throw new Error('Guild settings write failed.');
    return {
      guildId,
      idleDisconnectSeconds:
        record.idleDisconnectSeconds ?? DEFAULT_IDLE_DISCONNECT_SECONDS,
      audioQuality: record.audioQuality ?? DEFAULT_AUDIO_QUALITY,
    };
  }
}

export async function connectGuildSettings(
  uri: string,
): Promise<{ repository: GuildSettingsRepository; close(): Promise<void> }> {
  const connection = await mongoose
    .createConnection(uri, {
      serverSelectionTimeoutMS: 5_000,
      bufferCommands: false,
    })
    .asPromise();
  return {
    repository: new MongoGuildSettingsRepository(connection),
    close: async () => {
      await connection.close();
    },
  };
}
