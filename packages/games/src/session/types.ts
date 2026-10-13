export const GAME_KINDS = ['rps', 'hangman', 'uno', 'musictrivia'] as const;
export type GameKind = (typeof GAME_KINDS)[number];
export type GamePhase =
  'lobby' | 'preparing' | 'active' | 'reveal' | 'finished' | 'abandoned';
export interface TriviaTrack {
  id: string;
  title: string;
  artists: string[];
}
export interface GameOptions {
  id: string;
  guildId: string;
  channelId: string;
  hostId: string;
  kind: GameKind;
  now: number;
  invitedUserId?: string;
  rounds?: number;
  bestOf?: number;
  answerMode?: 'song' | 'artist' | 'both';
  tracks?: readonly TriviaTrack[];
  word?: string;
  random?: () => number;
  stackDrawTwo?: boolean;
  drawUntilPlayable?: boolean;
  lobbyMs?: number;
  turnMs?: number;
  answerMs?: number;
  lifetimeMs?: number;
  manualPreview?: boolean;
}
export type GameAction =
  | { type: 'rps'; choice: 'rock' | 'paper' | 'scissors' }
  | { type: 'guess'; text: string; artist?: string }
  | { type: 'card'; cardId: string; color?: string; uno?: boolean }
  | { type: 'draw' };
export interface GameResult {
  sessionId: string;
  guildId: string;
  userId: string;
  game: GameKind;
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
export interface GameView {
  id: string;
  kind: GameKind;
  hostId: string;
  invitedUserId?: string;
  phase: GamePhase;
  revision: number;
  round: number;
  roundLimit?: number;
  players: string[];
  spectators: string[];
  scores: Record<string, number>;
  deadline: number;
  turn?: string;
  table?: string;
  counts?: Record<string, number>;
  maskedWord?: string;
  mistakes?: number;
  reveal?: string;
  winners: string[];
}
export class GameError extends Error {
  constructor(
    readonly code:
      | 'GAME_INVALID'
      | 'GAME_NOT_FOUND'
      | 'GAME_BUSY'
      | 'GAME_FORBIDDEN'
      | 'GAME_STALE'
      | 'GAME_DUPLICATE'
      | 'GAME_FINISHED',
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
export function requireGame(
  condition: unknown,
  code: GameError['code'],
  message: string,
): asserts condition {
  if (!condition) throw new GameError(code, message);
}
