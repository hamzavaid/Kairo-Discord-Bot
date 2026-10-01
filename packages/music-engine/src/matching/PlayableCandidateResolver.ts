import { MusicError } from '../api/errors.js';
import type { MetadataProviderId } from '../api/MetadataOptions.js';
import type { Track } from '../domain/Track.js';
import { normalizeProviderTrack } from '../parser/TrackNormalizer.js';
import type { MetadataProviderManager } from '../providers/MetadataProviderManager.js';
import { CandidateMatcher } from './CandidateMatcher.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;

export class PlayableCandidateResolver {
  constructor(
    private readonly metadata: MetadataProviderManager,
    private readonly matcher: CandidateMatcher,
    private readonly searchProvider: Extract<
      MetadataProviderId,
      'youtube-sr' | 'youtube-api'
    >,
  ) {}

  async prepare(track: Track, signal?: AbortSignal): Promise<Track> {
    if (track.sourceProvider === 'fixture') return track;
    if (
      track.sourceProvider === 'youtube-sr' ||
      track.sourceProvider === 'youtube-api'
    ) {
      if (!track.sourceId || !VIDEO_ID.test(track.sourceId))
        throw new MusicError(
          'STREAM_UNAVAILABLE',
          'No playable source is available.',
        );
      return {
        ...track,
        provenance: {
          ...track.provenance,
          originalSourceProvider:
            track.provenance.originalSourceProvider ?? track.sourceProvider,
          ...((track.provenance.originalSourceId ?? track.sourceId)
            ? {
                originalSourceId:
                  track.provenance.originalSourceId ?? track.sourceId!,
              }
            : {}),
          selectedProviderId: track.sourceProvider,
          selectedCandidateId: track.sourceId,
          streamProvider: 'yt-dlp',
        },
      };
    }
    if (
      track.sourceProvider !== 'spotify' &&
      track.sourceProvider !== 'musicbrainz'
    )
      throw new MusicError(
        'STREAM_UNAVAILABLE',
        'No playable source is available.',
      );
    const query =
      `${track.artists.map((artist) => artist.name).join(' ')} ${track.title}`.trim();
    const { provider, value } = await this.metadata.searchOn(
      this.searchProvider,
      query,
      10,
      signal,
    );
    const candidates = value.map((payload) =>
      normalizeProviderTrack(payload, {
        providerId: provider.id,
        input: track.provenance.input,
        requestedBy: track.requestedBy,
        parsedBy: provider.id,
      }),
    );
    const matched = this.matcher.match({ source: track, candidates });
    return {
      ...matched.candidate,
      provenance: {
        ...matched.candidate.provenance,
        input: track.provenance.input,
        candidateSearchProvider: provider.id,
        selectedCandidateId: matched.candidate.sourceId!,
        streamProvider: 'yt-dlp',
      },
    };
  }
}
