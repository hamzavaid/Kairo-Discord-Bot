import { trackIdentity } from '@kairo/data';
import type { Track } from '@kairo/music-engine';
import { CommandError } from '../errors.js';
import { restoreTrack, type LibraryService } from './LibraryService.js';
import type { HistoryService } from './HistoryService.js';
import type { MusicService } from './MusicService.js';
export interface RecommendationRequest {
  guildId: string;
  userId: string;
  query?: string;
  seed?: Track;
  signal?: AbortSignal;
}
/** Canonical metadata suggestions; playable matching/streams remain playback-time behavior. */
export class RecommendationService {
  constructor(
    private readonly music: MusicService,
    private readonly history?: HistoryService,
    private readonly library?: LibraryService,
  ) {}
  async recommend(request: RecommendationRequest): Promise<Track[]> {
    const check = () => {
      if (request.signal?.aborted)
        throw new CommandError(
          'RECOMMENDATION_UNAVAILABLE',
          'Recommendation search was cancelled.',
        );
    };
    check();
    try {
      const recent =
        (await this.history?.recent({ guildId: request.guildId }, 100)) ?? [];
      let seed = request.seed;
      if (request.query)
        seed = await this.music.info(
          request.query,
          request.guildId,
          request.userId,
          ...(request.signal ? [request.signal] : []),
        );
      if (!seed) {
        try {
          seed = this.music.currentTrack(request.guildId);
        } catch {
          /* Try personal seeds. */
        }
      }
      const likes =
        !seed && this.library
          ? await this.library.liked(request.userId)
          : undefined;
      if (!seed && likes?.entries[0])
        seed = restoreTrack(likes.entries[0].track, request.userId);
      if (!seed && recent[0])
        seed = restoreTrack(recent[0].track, request.userId);
      if (!seed)
        throw new CommandError(
          'RECOMMENDATION_UNAVAILABLE',
          'Play or like a song first, or provide a query.',
        );
      check();
      const excluded = new Set([
        trackIdentity(seed),
        ...recent.map((r) => trackIdentity(r.track)),
      ]);
      const recentArtists = new Set(
        recent
          .slice(0, 5)
          .flatMap((r) =>
            r.track.artists.map((a) => a.name.normalize('NFKC').toLowerCase()),
          ),
      );
      const query = seed.artists.length
        ? `${seed.artists
            .slice(0, 2)
            .map((a) => a.name)
            .join(' ')} music`
        : seed.title;
      const found = await this.music.infoResults(
        query,
        request.guildId,
        request.userId,
        25,
        request.signal,
      );
      check();
      const unique = new Map<string, Track>();
      for (const track of found) {
        const identity = trackIdentity(track);
        if (!excluded.has(identity) && !unique.has(identity))
          unique.set(identity, track);
      }
      const freshness = (track: Track) =>
        track.artists.some((a) =>
          recentArtists.has(a.name.normalize('NFKC').toLowerCase()),
        )
          ? 1
          : 0;
      const results = [...unique.values()]
        .sort((a, b) => freshness(a) - freshness(b))
        .slice(0, 10);
      if (!results.length)
        throw new CommandError(
          'RECOMMENDATION_UNAVAILABLE',
          'No fresh recommendations were found. Try another query.',
        );
      return results;
    } catch (error) {
      if (error instanceof CommandError) throw error;
      throw new CommandError(
        'RECOMMENDATION_UNAVAILABLE',
        'Recommendations are temporarily unavailable.',
        { cause: error },
      );
    }
  }
}
