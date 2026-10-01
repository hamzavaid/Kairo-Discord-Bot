import {
  LibraryError,
  saveTrack,
  trackIdentity,
  type LibraryRepository,
  type LibraryCollection,
  type SavedTrack,
} from '@kairo/data';
import type { Track, VoiceTarget } from '@kairo/music-engine';
import type { MusicService } from './MusicService.js';

export function libraryPage<T>(
  items: readonly T[],
  page = 1,
  size = 10,
): { items: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  if (!Number.isInteger(page) || page < 1 || page > pages)
    throw new LibraryError('INVALID_PAGE', `Choose a page from 1 to ${pages}.`);
  return {
    items: items.slice((page - 1) * size, page * size),
    page,
    pages,
    total: items.length,
  };
}
function restore(track: SavedTrack, userId: string): Track {
  return {
    id: trackIdentity(track),
    title: track.title,
    artists: track.artists.map((a) => ({
      name: a.name,
      ...(a.id ? { id: a.id } : {}),
    })),
    sourceProvider: track.sourceProvider,
    ...(track.sourceId ? { sourceId: track.sourceId } : {}),
    isLive: track.isLive,
    requestedBy: userId,
    createdAt: new Date(),
    ...(track.durationMs === undefined ? {} : { durationMs: track.durationMs }),
    ...(track.canonicalUrl ? { canonicalUrl: track.canonicalUrl } : {}),
    ...(track.album
      ? {
          album: {
            title: track.album.title,
            ...(track.album.id ? { id: track.album.id } : {}),
          },
        }
      : {}),
    ...(track.explicit === undefined ? {} : { explicit: track.explicit }),
    provenance: {
      input: track.canonicalUrl ?? track.title,
      parsedBy: 'saved',
      ...(track.originId && track.originProvider
        ? {
            originalSourceProvider: track.originProvider,
            originalSourceId: track.originId,
          }
        : {}),
    },
  };
}
export class LibraryService {
  constructor(
    private readonly repository: LibraryRepository,
    private readonly music: MusicService,
  ) {}
  create(owner: string, name: string) {
    return this.repository.create(owner, name);
  }
  get(owner: string, name: string) {
    return this.repository.get(owner, name);
  }
  list(owner: string) {
    return this.repository.list(owner);
  }
  delete(owner: string, name: string, expected?: LibraryCollection) {
    return this.repository.delete(owner, name, expected);
  }
  rename(owner: string, name: string, newName: string) {
    return this.repository.rename(owner, name, newName);
  }
  remove(owner: string, name: string, position: number) {
    return this.repository.remove(owner, name, position);
  }
  clear(owner: string, name: string, expected?: LibraryCollection) {
    return this.repository.clear(owner, name, expected);
  }
  move(owner: string, name: string, from: number, to: number) {
    return this.repository.move(owner, name, from, to);
  }
  async add(owner: string, name: string, query: string, guildId: string) {
    await this.repository.get(owner, name);
    return this.repository.append(owner, name, [
      saveTrack(await this.music.info(query, guildId, owner)),
    ]);
  }
  async importCollection(
    owner: string,
    name: string,
    url: string,
    guildId: string,
  ) {
    const collection = await this.music.collection(url, guildId, owner);
    try {
      await this.repository.get(owner, name);
    } catch (error) {
      if (
        !(error instanceof LibraryError) ||
        error.code !== 'PLAYLIST_NOT_FOUND'
      )
        throw error;
      try {
        await this.repository.create(owner, name);
      } catch (createError) {
        if (
          !(createError instanceof LibraryError) ||
          createError.code !== 'PLAYLIST_ALREADY_EXISTS'
        )
          throw createError;
      }
    }
    const appended = await this.repository.append(
      owner,
      name,
      collection.tracks.map((t) => saveTrack(t)),
      {
        provider: collection.sourceProvider,
        collectionId: collection.sourceId ?? collection.id,
      },
    );
    const summary = collection.importSummary;
    return {
      collection: appended.collection,
      imported: appended.added,
      skipped: (summary?.skipped ?? 0) + appended.duplicates,
      failed: summary?.failed ?? 0,
      total: summary?.total ?? collection.tracks.length,
      truncated: summary?.truncated ?? false,
      partial: summary?.partial ?? false,
    };
  }
  private playCollection(
    owner: string,
    collection: LibraryCollection,
    target: VoiceTarget,
  ) {
    if (!collection.entries.length)
      throw new LibraryError(
        collection.kind === 'liked' ? 'LIKED_SONGS_EMPTY' : 'COLLECTION_EMPTY',
        collection.kind === 'liked'
          ? 'Your Liked Songs collection is empty.'
          : 'The playlist is empty.',
      );
    return this.music.playTracks({
      guildId: target.guildId,
      userId: owner,
      voiceTarget: target,
      tracks: collection.entries.map((e) => restore(e.track, owner)),
    });
  }
  async play(owner: string, name: string, target: VoiceTarget) {
    return this.playCollection(
      owner,
      await this.repository.get(owner, name),
      target,
    );
  }
  liked(owner: string) {
    return this.repository.liked(owner);
  }
  async playLiked(owner: string, target: VoiceTarget) {
    return this.playCollection(
      owner,
      await this.repository.liked(owner),
      target,
    );
  }
  clearLiked(owner: string, expected?: LibraryCollection) {
    return this.repository.clearLiked(owner, expected);
  }
  private async resolve(owner: string, guildId: string, query?: string) {
    return query
      ? this.music.info(query, guildId, owner)
      : this.music.currentTrack(guildId);
  }
  async like(owner: string, guildId: string, query?: string) {
    const track = await this.resolve(owner, guildId, query);
    return { ...(await this.repository.like(owner, saveTrack(track))), track };
  }
  async dislike(owner: string, guildId: string, query?: string) {
    return this.repository.unlike(
      owner,
      trackIdentity(saveTrack(await this.resolve(owner, guildId, query))),
    );
  }
}
