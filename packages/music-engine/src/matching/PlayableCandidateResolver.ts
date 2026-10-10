import { setTimeout as delay } from 'node:timers/promises';
import { titleReadings, artistReadings } from './titleReadings.js';
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
    const artists = track.artists.map((artist) => artist.name).join(' ');
    const queries = [
      `${artists} ${track.title}`.trim(),
      `"${track.title.replace(/"/gu, '')}" ${artists} official audio`.trim(),
    ];
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 20000);
    const active = signal
      ? AbortSignal.any([signal, timeout.signal])
      : timeout.signal;
    const pool = new Map<string, Track>();
    try {
      for (let index = 0; index < queries.length; index++) {
        let response;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await this.metadata.searchOn(
              this.searchProvider,
              queries[index]!,
              25,
              active,
            );
            break;
          } catch (error) {
            if (active.aborted) throw error;
            if (
              attempt ||
              !(error instanceof MusicError) ||
              !error.retryable ||
              !['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT'].includes(error.code)
            )
              throw error;
            await delay(250, undefined, { signal: active });
          }
        }
        if (!response)
          throw new MusicError(
            'PROVIDER_UNAVAILABLE',
            'The music source is temporarily unavailable.',
            true,
          );
        for (const payload of response.value) {
          const candidate = normalizeProviderTrack(payload, {
            providerId: response.provider.id,
            input: track.provenance.input,
            requestedBy: track.requestedBy,
            parsedBy: response.provider.id,
          });
          pool.set(candidate.id, candidate);
        }
        const candidates = [...pool.values()];
        const readings = await titleReadings([track, ...candidates], active);
        const artists = await artistReadings([track, ...candidates], active);
        try {
          const matched = this.matcher.match({
            source: track,
            candidates,
            titleReadings: readings,
            artistReadings: artists,
          });
          return {
            ...matched.candidate,
            provenance: {
              ...matched.candidate.provenance,
              input: track.provenance.input,
              candidateSearchProvider: response.provider.id,
              selectedCandidateId: matched.candidate.sourceId!,
              streamProvider: 'yt-dlp',
            },
          };
        } catch (error) {
          if (
            !(error instanceof MusicError) ||
            error.code !== 'NO_RELIABLE_MATCH' ||
            index === queries.length - 1
          )
            throw error;
        }
      }
      throw new MusicError(
        'NO_RELIABLE_MATCH',
        'No reliable match was found for this song.',
      );
    } catch (error) {
      if (signal?.aborted)
        throw new MusicError(
          'PARSER_CANCELLED',
          'The music request was cancelled.',
        );
      if (timeout.signal.aborted)
        throw new MusicError(
          'PROVIDER_TIMEOUT',
          'Playable candidate discovery timed out.',
          true,
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
