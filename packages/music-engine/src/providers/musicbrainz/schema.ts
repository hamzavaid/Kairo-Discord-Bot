import { z } from 'zod';
import { MusicError } from '../../api/errors.js';
import type { ProviderTrack } from '../MediaProvider.js';

const uuid = z.string().uuid();
const credit = z.union([
  z.string(),
  z.object({
    name: z.string().optional(),
    artist: z.object({ id: uuid.optional(), name: z.string().min(1) }),
  }),
]);
const recording = z.object({
  id: uuid,
  title: z.string().min(1),
  length: z.number().int().positive().nullish(),
  'artist-credit': z.array(credit).min(1),
});
const searchResponse = z.object({
  count: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  recordings: z.array(recording),
});

function invalidPayload(): never {
  throw new MusicError(
    'PROVIDER_PARSE_ERROR',
    'The music source returned invalid metadata.',
  );
}

function toTrack(value: z.infer<typeof recording>): ProviderTrack {
  const artists = value['artist-credit']
    .filter(
      (item): item is Exclude<typeof item, string> => typeof item !== 'string',
    )
    .map((item) => ({
      name: item.name || item.artist.name,
      ...(item.artist.id === undefined ? {} : { id: item.artist.id }),
    }));
  if (artists.length === 0) invalidPayload();
  return {
    sourceId: value.id,
    title: value.title,
    artists,
    ...(value.length == null ? {} : { durationMs: value.length }),
    canonicalUrl: `https://musicbrainz.org/recording/${value.id}`,
  };
}

export function parseRecording(payload: unknown): ProviderTrack {
  const result = recording.safeParse(payload);
  if (!result.success) invalidPayload();
  return toTrack(result.data);
}

export function parseSearch(payload: unknown): ProviderTrack[] {
  const result = searchResponse.safeParse(payload);
  if (!result.success) invalidPayload();
  return result.data.recordings.map(toTrack);
}
