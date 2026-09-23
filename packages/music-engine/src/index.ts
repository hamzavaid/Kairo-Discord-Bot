export {
  createKairoMusicEngine,
  type KairoMusicEngine,
  type EngineOptions,
} from './api/KairoMusicEngine.js';
export { MusicError, type MusicErrorCode } from './api/errors.js';
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
export const ENGINE_API_VERSION = 1;
