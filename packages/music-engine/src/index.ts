export {
  createKairoMusicEngine,
  type KairoMusicEngine,
  type EngineOptions,
} from './api/KairoMusicEngine.js';
export { MusicError, type MusicErrorCode } from './api/errors.js';
export type { MusicBrainzOptions } from './api/MusicBrainzOptions.js';
export type {
  MetadataProviderId,
  YoutubeSrOptions,
  YouTubeApiOptions,
  SpotifyOptions,
} from './api/MetadataOptions.js';
export type { KairoMusicEvent, Unsubscribe } from './api/events.js';
export type {
  FixtureTrack,
  ParseRequest,
  ParseResult,
} from './api/requests.js';
export type {
  ArtistRef,
  AlbumRef,
  Track,
  TrackProvenance,
} from './domain/Track.js';
export type { TrackCollection } from './domain/TrackCollection.js';
export const ENGINE_API_VERSION = 1;
