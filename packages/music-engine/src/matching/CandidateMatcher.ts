import { MusicError, NoReliableMatchError } from '../api/errors.js';
import { DEFAULT_WEIGHTS, scoreCandidate } from './scoring.js';
import type {
  MatchRequest,
  MatchResult,
  MatcherOptions,
  MatchWeights,
} from './types.js';

interface Ranked {
  result: MatchResult;
  rejectionReason?: string;
}

export class CandidateMatcher {
  private readonly threshold: number;
  private readonly weights: MatchWeights;
  private readonly quality: Readonly<Record<string, number>>;
  private readonly aliases: Readonly<Record<string, string>>;

  constructor(private readonly options: MatcherOptions = {}) {
    this.threshold = options.threshold ?? 0.82;
    if (
      !Number.isFinite(this.threshold) ||
      this.threshold < 0 ||
      this.threshold > 1
    )
      throw new MusicError(
        'INVALID_QUERY',
        'Match threshold must be between 0 and 1.',
      );
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    const values = Object.values(this.weights);
    if (
      values.some((value) => !Number.isFinite(value) || value < 0) ||
      Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.000001
    )
      throw new MusicError(
        'INVALID_QUERY',
        'Match weights must be nonnegative and total 1.',
      );
    this.quality = options.providerQuality ?? {};
    if (
      Object.values(this.quality).some(
        (value) => !Number.isFinite(value) || value < 0 || value > 1,
      )
    )
      throw new MusicError(
        'INVALID_QUERY',
        'Provider quality must be between 0 and 1.',
      );
    this.aliases = options.artistAliases ?? {};
  }

  match(request: MatchRequest): MatchResult {
    const ranked: Ranked[] = request.candidates.map((candidate) => {
      const quality = Object.hasOwn(this.quality, candidate.sourceProvider)
        ? this.quality[candidate.sourceProvider]!
        : 0.5;
      const scored = scoreCandidate(
        request.source,
        candidate,
        this.weights,
        quality,
        this.aliases,
      );
      return {
        result: { candidate, score: scored.score, signals: scored.signals },
        ...(scored.rejectionReason
          ? { rejectionReason: scored.rejectionReason }
          : {}),
      };
    });
    ranked.sort(
      (left, right) =>
        right.result.score - left.result.score ||
        left.result.candidate.sourceProvider.localeCompare(
          right.result.candidate.sourceProvider,
          'en',
        ) ||
        (left.result.candidate.sourceId ?? '').localeCompare(
          right.result.candidate.sourceId ?? '',
          'en',
        ) ||
        left.result.candidate.id.localeCompare(right.result.candidate.id, 'en'),
    );
    const chosen = ranked.find(
      (item) => !item.rejectionReason && item.result.score >= this.threshold,
    );
    if (!chosen) {
      const reason =
        ranked.length === 0
          ? 'no_candidates'
          : (ranked[0]?.rejectionReason ?? 'below_threshold');
      this.options.logger?.debug(
        {
          candidateCount: ranked.length,
          sourceProvider: request.source.sourceProvider,
          ...(request.requestId ? { requestId: request.requestId } : {}),
          rejectionReason: reason,
          ...(ranked[0]
            ? {
                finalMatchScore: ranked[0].result.score,
                ...ranked[0].result.signals,
              }
            : {}),
        },
        'Candidate match rejected',
      );
      throw new NoReliableMatchError(request.requestId);
    }
    const { candidate, score, signals } = chosen.result;
    const matched = {
      ...candidate,
      provenance: {
        ...candidate.provenance,
        matchedFrom: request.source.sourceProvider,
        originalSourceProvider: request.source.sourceProvider,
        selectedProviderId: candidate.sourceProvider,
        confidence: score,
        matchSignals: { ...signals },
      },
    };
    this.options.logger?.debug(
      {
        candidateCount: ranked.length,
        sourceProvider: request.source.sourceProvider,
        selectedProvider: candidate.sourceProvider,
        ...(request.requestId ? { requestId: request.requestId } : {}),
        finalMatchScore: score,
        ...signals,
      },
      'Candidate match selected',
    );
    return { candidate: matched, score, signals };
  }
}
