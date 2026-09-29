import mongoose, { type Connection, type Model } from 'mongoose';

export const DEFAULT_IDLE_DISCONNECT_SECONDS = 60;
export const MAX_IDLE_DISCONNECT_SECONDS = 3600;

export interface GuildSettings {
  guildId: string;
  idleDisconnectSeconds: number;
}

export interface GuildSettingsRepository {
  get(guildId: string): Promise<GuildSettings>;
  setIdleDisconnectSeconds(
    guildId: string,
    seconds: number,
  ): Promise<GuildSettings>;
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
      min: 0,
      max: MAX_IDLE_DISCONNECT_SECONDS,
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
    return { guildId, idleDisconnectSeconds: record.idleDisconnectSeconds };
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
