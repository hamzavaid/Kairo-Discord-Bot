import { z } from 'zod';
import { MusicError } from '../api/errors.js';
import type { Track } from '../domain/Track.js';

const providerTrackSchema = z.object({
  sourceId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  artists: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        id: z.string().optional(),
      }),
    )
    .min(1),
  durationMs: z.number().int().positive().optional(),
  isLive: z.boolean().optional(),
  explicit: z.boolean().optional(),
  artworkUrl: z.string().url().optional(),
  canonicalUrl: z.string().url().optional(),
});

export interface NormalizeContext {
  providerId: string;
  input: string;
  requestedBy: string;
  parsedBy: string | 'search';
  canonicalUrl?: string;
}

export function normalizeProviderTrack(
  payload: unknown,
  context: NormalizeContext,
): Track {
  const result = providerTrackSchema.safeParse(payload);
  if (!result.success) {
    throw new MusicError(
      'PROVIDER_PARSE_ERROR',
      'The music source returned invalid metadata.',
    );
  }
  const track = result.data;
  const canonicalUrl = context.canonicalUrl ?? track.canonicalUrl;
  return {
    id: `${context.providerId}:${track.sourceId}`,
    title: track.title,
    artists: track.artists.map((artist) => ({
      name: artist.name,
      ...(artist.id === undefined ? {} : { id: artist.id }),
    })),
    ...(track.durationMs === undefined ? {} : { durationMs: track.durationMs }),
    ...(track.artworkUrl === undefined ? {} : { artworkUrl: track.artworkUrl }),
    ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
    sourceProvider: context.providerId,
    sourceId: track.sourceId,
    isLive: track.isLive ?? false,
    requestedBy: context.requestedBy,
    ...(track.explicit === undefined ? {} : { explicit: track.explicit }),
    provenance: { input: context.input, parsedBy: context.parsedBy },
    createdAt: new Date(),
  };
}
