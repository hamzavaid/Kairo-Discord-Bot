import { trackIdentity } from '@kairo/data';
import type { Track } from '@kairo/music-engine';
import { CommandError } from '../errors.js';
import { restoreTrack, type LibraryService } from './LibraryService.js';
import type { MusicService } from './MusicService.js';
import type { RecommendationService } from './RecommendationService.js';
import type { HistoryService } from './HistoryService.js';
import { BackgroundJobs } from './BackgroundJobs.js';
export const DISCOVERY_SECTIONS = [
  'recommended',
  'liked',
  'recent',
  'radio',
  'artists',
  'search',
] as const;
export type DiscoverySection = (typeof DISCOVERY_SECTIONS)[number];
export interface DiscoveryRequest {
  guildId: string;
  userId: string;
  query?: string;
  signal?: AbortSignal;
}
export interface DiscoveryResult {
  section: DiscoverySection;
  title: string;
  tracks: Track[];
  notice?: string;
}
export class DiscoveryService {
  constructor(
    private readonly music: MusicService,
    private readonly recommendations: RecommendationService,
    private readonly library: LibraryService,
    private readonly history: HistoryService,
    private readonly jobs = new BackgroundJobs(),
  ) {}
  async load(
    section: DiscoverySection,
    request: DiscoveryRequest,
  ): Promise<DiscoveryResult> {
    return this.jobs.run(
      'discovery',
      request.guildId,
      (signal) => this.resolve(section, { ...request, signal }),
      request.signal,
    );
  }
  private async resolve(
    section: DiscoverySection,
    request: DiscoveryRequest,
  ): Promise<DiscoveryResult> {
    request.signal?.throwIfAborted();
    if (!DISCOVERY_SECTIONS.includes(section))
      throw new CommandError(
        'DISCOVERY_UNAVAILABLE',
        'Choose a supported discovery section.',
      );
    const titles: Record<DiscoverySection, string> = {
      recommended: 'Recommended for you',
      liked: 'Liked Songs',
      recent: 'Recently requested',
      radio: 'Radio ideas',
      artists: 'Browse artists',
      search: 'Search music',
    };
    let tracks: Track[] = [];
    let notice: string | undefined;
    try {
      if (section === 'liked') {
        const collection = await this.library.liked(request.userId);
        tracks = collection.entries.map((e) =>
          restoreTrack(e.track, request.userId),
        );
        notice =
          'A preview of your personal library. Use /liked for the full collection.';
      } else if (section === 'recent') {
        const rows = await this.history.recent({ userId: request.userId }, 100);
        tracks = rows
          .filter((r) => r.status !== 'failed')
          .map((r) => restoreTrack(r.track, request.userId));
      } else if (section === 'recommended' || section === 'radio') {
        try {
          tracks = await this.recommendations.recommend(request);
        } catch (error) {
          if (error instanceof CommandError && !error.cause)
            notice = error.message;
          else throw error;
        }
        if (section === 'radio' && tracks.length)
          notice =
            'Suggestions only. Nothing is queued; /autoplay controls automatic radio.';
      } else {
        let query = request.query;
        if (section === 'artists' && !query) {
          try {
            query = this.music.currentTrack(request.guildId).artists[0]?.name;
          } catch {
            /* Use retained personal history. */
          }
          if (!query)
            query = (
              await this.history.recent({ userId: request.userId }, 1)
            )[0]?.track.artists[0]?.name;
        }
        if (query)
          tracks = await this.music.infoResults(
            section === 'artists' ? `${query} music` : query,
            request.guildId,
            request.userId,
            25,
            request.signal,
          );
        else notice = 'Use Search to enter a song or artist query.';
      }
      request.signal?.throwIfAborted();
      const unique = new Map<string, Track>();
      for (const track of tracks)
        if (!unique.has(trackIdentity(track)))
          unique.set(trackIdentity(track), track);
      return {
        section,
        title: titles[section],
        tracks: [...unique.values()].slice(0, 25),
        ...(notice ? { notice } : {}),
      };
    } catch (error) {
      if (error instanceof CommandError) throw error;
      throw new CommandError(
        'DISCOVERY_UNAVAILABLE',
        'Discovery is temporarily unavailable.',
        { cause: error },
      );
    }
  }
}
