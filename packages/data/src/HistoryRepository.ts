import mongoose, { type Connection, type Model } from 'mongoose';
import {
  saveTrack,
  trackIdentity,
  type SavedTrack,
} from './LibraryRepository.js';
export type HistoryStatus =
  'playing' | 'completed' | 'skipped' | 'stopped' | 'disconnected' | 'failed';
export interface HistoryRecord {
  attemptId: string;
  guildId: string;
  userId: string;
  track: SavedTrack;
  fingerprint: string;
  requestedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  status: HistoryStatus;
  source: 'manual' | 'autoplay';
  listenedMs: number;
  expiresAt: Date;
}
export type HistoryInput = Omit<
  HistoryRecord,
  'fingerprint' | 'expiresAt' | 'track'
> & { track: unknown };
export interface HistoryScope {
  userId?: string;
  guildId?: string;
  since?: Date;
}
export interface HistoryRepository {
  record(input: HistoryInput): Promise<void>;
  list(
    scope: HistoryScope,
    page?: number,
    limit?: number,
  ): Promise<HistoryRecord[]>;
  scan(scope: HistoryScope, limit?: number): Promise<HistoryRecord[]>;
}
export const HISTORY_RETENTION_DAYS = 180;
export const historySchema = new mongoose.Schema<HistoryRecord>(
  {
    attemptId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    track: { type: Object, required: true },
    fingerprint: { type: String, required: true },
    requestedAt: { type: Date, required: true },
    startedAt: Date,
    endedAt: Date,
    status: {
      type: String,
      enum: [
        'playing',
        'completed',
        'skipped',
        'stopped',
        'disconnected',
        'failed',
      ],
      required: true,
    },
    source: { type: String, enum: ['manual', 'autoplay'], required: true },
    listenedMs: { type: Number, min: 0, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
historySchema.index({ userId: 1, requestedAt: -1, attemptId: 1 });
historySchema.index({ guildId: 1, requestedAt: -1, attemptId: 1 });
historySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
function scopeFilter(scope: HistoryScope) {
  if (!scope.userId && !scope.guildId)
    throw new RangeError('History requires user or guild scope.');
  return {
    ...(scope.userId ? { userId: scope.userId } : {}),
    ...(scope.guildId ? { guildId: scope.guildId } : {}),
    ...(scope.since ? { requestedAt: { $gte: scope.since } } : {}),
  };
}
export class MongoHistoryRepository implements HistoryRepository {
  private readonly model: Model<HistoryRecord>;
  constructor(connection: Connection) {
    this.model = connection.model<HistoryRecord>(
      'KairoListeningHistory',
      historySchema,
    );
  }
  async initialize() {
    await this.model.init();
  }
  async record(input: HistoryInput): Promise<void> {
    if (
      !input.attemptId ||
      !input.guildId ||
      !input.userId ||
      !Number.isFinite(input.listenedMs) ||
      input.listenedMs < 0 ||
      !Number.isFinite(input.requestedAt?.getTime()) ||
      !['manual', 'autoplay'].includes(input.source) ||
      ![
        'playing',
        'completed',
        'skipped',
        'stopped',
        'disconnected',
        'failed',
      ].includes(input.status)
    )
      throw new RangeError('Invalid history record.');
    const track = saveTrack(input.track);
    const base = {
      guildId: input.guildId,
      userId: input.userId,
      track,
      fingerprint: trackIdentity(track),
      requestedAt: input.requestedAt,
      source: input.source,
      expiresAt: new Date(
        input.requestedAt.getTime() + HISTORY_RETENTION_DAYS * 86400000,
      ),
    };
    const fields = {
      status: input.status,
      listenedMs: Math.round(input.listenedMs),
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      ...(input.endedAt ? { endedAt: input.endedAt } : {}),
    };
    // A late duplicate start cannot overwrite a terminal outcome; identity is immutable.
    const filter = { attemptId: input.attemptId };
    if (input.status === 'playing') {
      await this.model
        .updateOne(
          filter,
          { $setOnInsert: { ...base, ...fields } },
          { upsert: true, runValidators: true },
        )
        .exec();
    } else
      await this.model
        .updateOne(
          filter,
          { $setOnInsert: base, $set: fields },
          { upsert: true, runValidators: true },
        )
        .exec();
  }
  async list(scope: HistoryScope, page = 1, limit = 10) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 25
    )
      throw new RangeError('Invalid history page.');
    return this.model
      .find(scopeFilter(scope))
      .sort({ requestedAt: -1, attemptId: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();
  }
  async scan(scope: HistoryScope, limit = 10000) {
    return this.model
      .find(scopeFilter(scope))
      .sort({ requestedAt: -1, attemptId: 1 })
      .limit(Math.max(1, Math.min(10000, limit)))
      .lean()
      .exec();
  }
}
export interface AuditRecord {
  command: string;
  guildId?: string;
  userId: string;
  timestamp: string;
  success: boolean;
  durationMs: number;
  errorCode?: string;
}
export interface AuditRepository {
  record(input: AuditRecord): Promise<void>;
  list(page?: number, limit?: number): Promise<AuditRecord[]>;
}
type AuditDocument = Omit<AuditRecord, 'timestamp'> & {
  timestamp: Date;
  expiresAt: Date;
};
const auditSchema = new mongoose.Schema<AuditDocument>(
  {
    command: { type: String, required: true },
    guildId: String,
    userId: { type: String, required: true },
    timestamp: { type: Date, required: true },
    success: Boolean,
    durationMs: Number,
    errorCode: String,
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
auditSchema.index({ guildId: 1, timestamp: -1 });
auditSchema.index({ userId: 1, timestamp: -1 });
auditSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export class MongoAuditRepository implements AuditRepository {
  private readonly model: Model<AuditDocument>;
  constructor(connection: Connection) {
    this.model = connection.model<AuditDocument>(
      'KairoCommandAudit',
      auditSchema,
    );
  }
  async initialize() {
    await this.model.init();
  }
  async record(input: AuditRecord) {
    const timestamp = new Date(input.timestamp);
    if (
      !Number.isFinite(timestamp.getTime()) ||
      !input.command ||
      !input.userId ||
      !Number.isFinite(input.durationMs) ||
      input.durationMs < 0
    )
      throw new RangeError('Invalid command audit.');
    await this.model.create({
      command: input.command.slice(0, 100),
      userId: input.userId,
      ...(input.guildId ? { guildId: input.guildId } : {}),
      timestamp,
      success: input.success,
      durationMs: input.durationMs,
      ...(input.errorCode ? { errorCode: input.errorCode.slice(0, 100) } : {}),
      expiresAt: new Date(timestamp.getTime() + 90 * 86400000),
    });
  }
  async list(page = 1, limit = 10): Promise<AuditRecord[]> {
    const records = await this.model
      .find()
      .sort({ timestamp: -1, _id: 1 })
      .skip((Math.max(1, page) - 1) * Math.min(20, limit))
      .limit(Math.min(20, limit))
      .lean()
      .exec();
    return records.map((r) => ({
      command: r.command,
      userId: r.userId,
      ...(r.guildId ? { guildId: r.guildId } : {}),
      timestamp: new Date(r.timestamp).toISOString(),
      success: r.success,
      durationMs: r.durationMs,
      ...(r.errorCode ? { errorCode: r.errorCode } : {}),
    }));
  }
}
