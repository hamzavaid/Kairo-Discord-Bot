import {
  MongoHistoryRepository,
  MongoAuditRepository,
  type HistoryRepository,
  type AuditRepository,
} from './HistoryRepository.js';
import {
  MongoLibraryRepository,
  type LibraryRepository,
} from './LibraryRepository.js';
import mongoose, { type Connection, type Model } from 'mongoose';

export const DEFAULT_IDLE_DISCONNECT_SECONDS = 60;
export const MAX_IDLE_DISCONNECT_SECONDS = 3600;
export const AUDIO_QUALITIES = ['low', 'medium', 'high', 'best'] as const;
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];
export const DEFAULT_AUDIO_QUALITY: AudioQuality = 'high';

export const FILTER_PRESETS = [
  'flat',
  'bassboost',
  'nightcore',
  'vaporwave',
  'lowpass',
  'highpass',
  'speech',
] as const;
export type FilterPreset = (typeof FILTER_PRESETS)[number];
export const CONTROL_POLICIES = [
  'everyone',
  'requester',
  'dj',
  'vote',
  'admin',
] as const;
export type ControlPolicy = (typeof CONTROL_POLICIES)[number];
export interface GuildControls {
  volume: number;
  autoplay: boolean;
  repeat: 'off' | 'track' | 'queue';
  filter: FilterPreset;
  djRoleId: string | null;
  controlPolicy: ControlPolicy;
  voteThreshold: number;
  cooldownSeconds: number;
  allowedTextChannels: string[];
  blockedTextChannels: string[];
}
export const DEFAULT_GUILD_CONTROLS: Readonly<GuildControls> = Object.freeze({
  volume: 75,
  autoplay: false,
  repeat: 'off',
  filter: 'flat',
  djRoleId: null,
  controlPolicy: 'everyone',
  voteThreshold: 0.5,
  cooldownSeconds: 2,
  allowedTextChannels: [],
  blockedTextChannels: [],
});
export function normalizeGuildControls(
  value?: Partial<GuildControls>,
): GuildControls {
  return {
    ...DEFAULT_GUILD_CONTROLS,
    ...value,
    allowedTextChannels: [...(value?.allowedTextChannels ?? [])],
    blockedTextChannels: [...(value?.blockedTextChannels ?? [])],
  };
}
export function validateGuildControls(value: Partial<GuildControls>): void {
  const finite = (n: number, min: number, max: number) =>
    Number.isFinite(n) && n >= min && n <= max;
  if (
    value.volume !== undefined &&
    (!Number.isInteger(value.volume) || !finite(value.volume, 0, 100))
  )
    throw new RangeError('Volume must be an integer from 0 to 100.');
  if (value.autoplay !== undefined && typeof value.autoplay !== 'boolean')
    throw new RangeError('Invalid autoplay setting.');
  if (value.filter !== undefined && !FILTER_PRESETS.includes(value.filter))
    throw new RangeError('Unknown filter preset.');
  if (
    value.repeat !== undefined &&
    !['off', 'track', 'queue'].includes(value.repeat)
  )
    throw new RangeError('Invalid repeat mode.');
  if (
    value.controlPolicy !== undefined &&
    !CONTROL_POLICIES.includes(value.controlPolicy)
  )
    throw new RangeError('Invalid control policy.');
  if (value.voteThreshold !== undefined && !finite(value.voteThreshold, 0.1, 1))
    throw new RangeError('Vote threshold must be between 0.1 and 1.');
  if (
    value.cooldownSeconds !== undefined &&
    !finite(value.cooldownSeconds, 0, 60)
  )
    throw new RangeError('Cooldown must be between 0 and 60 seconds.');
  if (
    value.djRoleId !== undefined &&
    value.djRoleId !== null &&
    !/^\d{17,20}$/u.test(value.djRoleId)
  )
    throw new RangeError('Invalid DJ role ID.');
  for (const list of [value.allowedTextChannels, value.blockedTextChannels])
    if (
      list !== undefined &&
      (!Array.isArray(list) ||
        list.length > 100 ||
        list.some((id) => !/^\d{17,20}$/u.test(id)) ||
        new Set(list).size !== list.length)
    )
      throw new RangeError('Invalid channel list.');
  for (const key of Object.keys(value))
    if (!(key in DEFAULT_GUILD_CONTROLS))
      throw new RangeError('Unknown guild setting.');
}

export interface GuildSettings {
  guildId: string;
  idleDisconnectSeconds: number;
  audioQuality: AudioQuality;
  controls?: Partial<GuildControls>;
}

export interface GuildSettingsRepository {
  get(guildId: string): Promise<GuildSettings>;
  setControls?(
    guildId: string,
    patch: Partial<GuildControls>,
  ): Promise<GuildSettings>;
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
    controls: {
      volume: { type: Number, min: 0, max: 100 },
      autoplay: Boolean,
      repeat: { type: String, enum: ['off', 'track', 'queue'] },
      filter: { type: String, enum: FILTER_PRESETS },
      djRoleId: String,
      controlPolicy: { type: String, enum: CONTROL_POLICIES },
      voteThreshold: { type: Number, min: 0.1, max: 1 },
      cooldownSeconds: { type: Number, min: 0, max: 60 },
      allowedTextChannels: { type: [String], default: undefined },
      blockedTextChannels: { type: [String], default: undefined },
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

  async setControls(
    guildId: string,
    patch: Partial<GuildControls>,
  ): Promise<GuildSettings> {
    validateGuildControls(patch);
    const changes = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [`controls.${key}`, value]),
    );
    const record = await this.model
      .findOneAndUpdate(
        { guildId },
        { $set: changes },
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
      controls: normalizeGuildControls(record.controls),
    };
  }

  async get(guildId: string): Promise<GuildSettings> {
    const record = await this.model.findOne({ guildId }).lean().exec();
    return {
      guildId,
      idleDisconnectSeconds:
        record?.idleDisconnectSeconds ?? DEFAULT_IDLE_DISCONNECT_SECONDS,
      audioQuality: record?.audioQuality ?? DEFAULT_AUDIO_QUALITY,
      ...(record?.controls
        ? { controls: normalizeGuildControls(record.controls) }
        : {}),
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
      ...(record.controls
        ? { controls: normalizeGuildControls(record.controls) }
        : {}),
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
      ...(record.controls
        ? { controls: normalizeGuildControls(record.controls) }
        : {}),
    };
  }
}

export async function connectGuildSettings(
  uri: string,
  options: { maxEntries?: number } = {},
): Promise<{
  repository: GuildSettingsRepository;
  library: LibraryRepository;
  history: HistoryRepository;
  audit: AuditRepository;
  close(): Promise<void>;
}> {
  const connection = await mongoose
    .createConnection(uri, {
      serverSelectionTimeoutMS: 5_000,
      bufferCommands: false,
    })
    .asPromise();
  const library = new MongoLibraryRepository(connection, options);
  const history = new MongoHistoryRepository(connection);
  const audit = new MongoAuditRepository(connection);
  try {
    await Promise.all([
      library.initialize(),
      history.initialize(),
      audit.initialize(),
    ]);
  } catch (error) {
    await connection.close();
    throw error;
  }
  return {
    library,
    history,
    audit,
    repository: new MongoGuildSettingsRepository(connection),
    close: async () => {
      await connection.close();
    },
  };
}
