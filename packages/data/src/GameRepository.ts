import mongoose, { type Connection, type Model } from 'mongoose';
export type PersistedGameKind = 'rps' | 'hangman' | 'uno' | 'musictrivia';
const kinds: PersistedGameKind[] = ['rps', 'hangman', 'uno', 'musictrivia'];
export interface GameSettings {
  enabledGames: PersistedGameKind[];
  lobbySeconds: number;
  turnSeconds: number;
  answerSeconds: number;
  previewSeconds: number;
  maxRounds: number;
}
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  enabledGames: [...kinds],
  lobbySeconds: 120,
  turnSeconds: 45,
  answerSeconds: 30,
  previewSeconds: 10,
  maxRounds: 20,
};
export interface PersistedGameResult {
  sessionId: string;
  guildId: string;
  userId: string;
  game: PersistedGameKind;
  playedAt: Date;
  wins: number;
  roundsWon: number;
  correctSongs: number;
  correctArtists: number;
  correctAnswers: number;
  attempts: number;
  bestStreak: number;
  points: number;
}
export interface GameStatistics {
  userId: string;
  gamesPlayed: number;
  wins: number;
  roundsWon: number;
  correctSongs: number;
  correctArtists: number;
  correctAnswers: number;
  attempts: number;
  bestStreak: number;
  points: number;
}
export interface GameRepository {
  settings(guildId: string): Promise<GameSettings>;
  setSettings(
    guildId: string,
    patch: Partial<GameSettings>,
  ): Promise<GameSettings>;
  record(result: PersistedGameResult): Promise<void>;
  leaderboard(
    guildId: string,
    game?: PersistedGameKind,
    userId?: string,
  ): Promise<GameStatistics[]>;
}
export function validateGameSettings(patch: Partial<GameSettings>) {
  if (
    patch.enabledGames &&
    (!Array.isArray(patch.enabledGames) ||
      patch.enabledGames.some((g) => !kinds.includes(g)) ||
      new Set(patch.enabledGames).size !== patch.enabledGames.length)
  )
    throw RangeError('Invalid enabled games.');
  for (const [key, min, max] of [
    ['lobbySeconds', 10, 300],
    ['turnSeconds', 10, 120],
    ['answerSeconds', 10, 60],
    ['previewSeconds', 3, 30],
    ['maxRounds', 1, 20],
  ] as const) {
    const value = patch[key];
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < min || value > max)
    )
      throw RangeError('Invalid game setting.');
  }
  for (const key of Object.keys(patch))
    if (!(key in DEFAULT_GAME_SETTINGS))
      throw RangeError('Unknown game setting.');
}
export const gameResultSchema = new mongoose.Schema<PersistedGameResult>(
  {
    sessionId: { type: String, required: true },
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    game: { type: String, enum: kinds, required: true },
    playedAt: { type: Date, required: true },
    wins: { type: Number, min: 0, max: 1 },
    roundsWon: Number,
    correctSongs: Number,
    correctArtists: Number,
    correctAnswers: Number,
    attempts: Number,
    bestStreak: Number,
    points: Number,
  },
  { versionKey: false },
);
gameResultSchema.index({ sessionId: 1, userId: 1 }, { unique: true });
gameResultSchema.index({ guildId: 1, game: 1, userId: 1 });
gameResultSchema.index({ guildId: 1, userId: 1 });
const settingsSchema = new mongoose.Schema<GameSettings & { guildId: string }>(
  {
    guildId: { type: String, required: true, unique: true },
    enabledGames: { type: [String], enum: kinds, default: undefined },
    lobbySeconds: Number,
    turnSeconds: Number,
    answerSeconds: Number,
    previewSeconds: Number,
    maxRounds: Number,
  },
  { versionKey: false },
);
export class MongoGameRepository implements GameRepository {
  private readonly results: Model<PersistedGameResult>;
  private readonly config: Model<GameSettings & { guildId: string }>;
  constructor(connection: Connection) {
    this.results = connection.model<PersistedGameResult>(
      'KairoGameResult',
      gameResultSchema,
    );
    this.config = connection.model<GameSettings & { guildId: string }>(
      'KairoGameSettings',
      settingsSchema,
    );
  }
  async initialize() {
    await Promise.all([this.results.init(), this.config.init()]);
  }
  private normalized(value?: Partial<GameSettings> | null): GameSettings {
    return {
      enabledGames: [
        ...(value?.enabledGames ?? DEFAULT_GAME_SETTINGS.enabledGames),
      ],
      lobbySeconds: value?.lobbySeconds ?? 120,
      turnSeconds: value?.turnSeconds ?? 45,
      answerSeconds: value?.answerSeconds ?? 30,
      previewSeconds: value?.previewSeconds ?? 10,
      maxRounds: value?.maxRounds ?? 20,
    };
  }
  async settings(guildId: string) {
    return this.normalized(
      await this.config.findOne({ guildId }).lean().exec(),
    );
  }
  async setSettings(guildId: string, patch: Partial<GameSettings>) {
    validateGameSettings(patch);
    return this.normalized(
      await this.config
        .findOneAndUpdate(
          { guildId },
          { $set: patch },
          { upsert: true, returnDocument: 'after', runValidators: true },
        )
        .lean()
        .exec(),
    );
  }
  async record(result: PersistedGameResult) {
    if (
      !result.sessionId ||
      !result.guildId ||
      !result.userId ||
      !kinds.includes(result.game) ||
      !Number.isFinite(result.playedAt?.getTime())
    )
      throw RangeError('Invalid game result.');
    const clean: PersistedGameResult = {
      sessionId: result.sessionId,
      guildId: result.guildId,
      userId: result.userId,
      game: result.game,
      playedAt: result.playedAt,
      wins: result.wins,
      roundsWon: result.roundsWon,
      correctSongs: result.correctSongs,
      correctArtists: result.correctArtists,
      correctAnswers: result.correctAnswers,
      attempts: result.attempts,
      bestStreak: result.bestStreak,
      points: result.points,
    };
    for (const key of [
      'wins',
      'roundsWon',
      'correctSongs',
      'correctArtists',
      'correctAnswers',
      'attempts',
      'bestStreak',
      'points',
    ] as const)
      if (
        !Number.isInteger(clean[key]) ||
        clean[key] < 0 ||
        clean[key] > 1000000
      )
        throw RangeError('Invalid game statistic.');
    if (clean.wins > 1) throw RangeError('Invalid wins.');
    await this.results
      .updateOne(
        { sessionId: result.sessionId, userId: result.userId },
        { $setOnInsert: clean },
        { upsert: true, runValidators: true },
      )
      .exec();
  }
  async leaderboard(
    guildId: string,
    game?: PersistedGameKind,
    userId?: string,
  ): Promise<GameStatistics[]> {
    if (!guildId || (game !== undefined && !kinds.includes(game)))
      throw RangeError('Invalid game statistics scope.');
    const totals = Object.fromEntries(
      [
        'wins',
        'roundsWon',
        'correctSongs',
        'correctArtists',
        'correctAnswers',
        'attempts',
        'points',
      ].map((key) => [key, { $sum: `$${key}` }]),
    );
    return this.results.aggregate<GameStatistics>([
      {
        $match: {
          guildId,
          ...(game ? { game } : {}),
          ...(userId ? { userId } : {}),
        },
      },
      {
        $group: {
          _id: '$userId',
          gamesPlayed: { $sum: 1 },
          bestStreak: { $max: '$bestStreak' },
          ...totals,
        },
      },
      { $sort: { wins: -1, points: -1, _id: 1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          gamesPlayed: 1,
          bestStreak: 1,
          wins: 1,
          roundsWon: 1,
          correctSongs: 1,
          correctArtists: 1,
          correctAnswers: 1,
          attempts: 1,
          points: 1,
        },
      },
    ]);
  }
}
