import type { Track } from '../domain/Track.js';

export interface MatchSignals {
  titleSimilarity: number;
  artistSimilarity: number;
  durationSimilarity: number;
  albumSimilarity: number;
  providerQuality: number;
  versionCompatibility: number;
}

export type MatchWeights = MatchSignals;

export interface MatchRequest {
  source: Track;
  candidates: readonly Track[];
  requestId?: string;
}

export interface MatchResult {
  candidate: Track;
  score: number;
  signals: MatchSignals;
}

export interface MatcherLogger {
  debug(
    fields: Record<string, string | number | boolean>,
    message: string,
  ): void;
}

export interface MatcherOptions {
  threshold?: number;
  weights?: Partial<MatchWeights>;
  providerQuality?: Readonly<Record<string, number>>;
  artistAliases?: Readonly<Record<string, string>>;
  logger?: MatcherLogger;
}
