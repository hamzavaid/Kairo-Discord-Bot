import { createHash, randomUUID } from 'node:crypto';
import mongoose, { type Connection, type Model } from 'mongoose';
import { z } from 'zod';

export class LibraryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}
const text = z.string().trim().min(1).max(500);
const savedSchema = z.object({
  title: text,
  artists: z
    .array(z.object({ name: text, id: z.string().max(200).optional() }))
    .min(1)
    .max(30),
  sourceProvider: z.enum([
    'youtube-sr',
    'youtube-api',
    'spotify',
    'musicbrainz',
    'fixture',
  ]),
  sourceId: z.string().min(1).max(200).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  isLive: z.boolean(),
  explicit: z.boolean().optional(),
  album: z
    .object({ title: text, id: z.string().max(200).optional() })
    .optional(),
  canonicalUrl: z.string().url().max(1000).optional(),
  originProvider: z.string().max(100).optional(),
  originId: z.string().max(200).optional(),
});
export type SavedTrack = z.infer<typeof savedSchema>;
type IdentityTrack = Pick<SavedTrack, 'title' | 'artists' | 'isLive'> & {
  sourceProvider: string;
  sourceId?: string | undefined;
  durationMs?: number | undefined;
  originProvider?: string | undefined;
  originId?: string | undefined;
  provenance?: {
    originalSourceProvider?: string;
    originalSourceId?: string;
    parsedBy?: string;
    input?: string;
  };
};
const normalized = (s: string) =>
  s.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
export function trackIdentity(track: IdentityTrack): string {
  const provider =
    track.originProvider ??
    track.provenance?.originalSourceProvider ??
    track.sourceProvider;
  const id = track.originId ?? track.provenance?.originalSourceId;
  const sourceProvider = id ? provider : track.sourceProvider;
  const sourceId = id ?? track.sourceId;
  const namespace = sourceProvider.startsWith('youtube-')
    ? 'youtube'
    : sourceProvider;
  if (sourceId) return `${namespace}:${sourceId}`;
  return `fingerprint:${createHash('sha256')
    .update(
      JSON.stringify([
        normalized(track.title),
        track.artists.map((a) => normalized(a.name)).sort(),
        track.durationMs ?? null,
        track.isLive,
      ]),
    )
    .digest('hex')}`;
}
/** Whitelist durable metadata; rebuild resource URLs instead of preserving signed/raw URLs. */
export function saveTrack(input: unknown): SavedTrack {
  const parsed = savedSchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryError('TRACK_INVALID', 'The track cannot be saved.');
  const track = parsed.data;
  const urls: Record<string, string> = {
    'youtube-sr': 'https://www.youtube.com/watch?v=',
    'youtube-api': 'https://www.youtube.com/watch?v=',
    spotify: 'https://open.spotify.com/track/',
    musicbrainz: 'https://musicbrainz.org/recording/',
    fixture: 'https://fixture.kairo.invalid/tracks/',
  };
  delete track.canonicalUrl;
  if (track.sourceId)
    track.canonicalUrl =
      urls[track.sourceProvider]! + encodeURIComponent(track.sourceId);
  const original = input as {
    provenance?: { originalSourceProvider?: string; originalSourceId?: string };
  };
  if (
    original.provenance?.originalSourceId &&
    original.provenance.originalSourceProvider
  ) {
    track.originProvider = original.provenance.originalSourceProvider;
    track.originId = original.provenance.originalSourceId;
  }
  return savedSchema.parse(track);
}
export interface LibraryEntry {
  id: string;
  fingerprint: string;
  track: SavedTrack;
  addedAt: Date;
  importSource?: { provider: string; collectionId: string };
}
export interface LibraryCollection {
  id: string;
  ownerUserId: string;
  kind: 'playlist' | 'liked';
  name: string;
  normalizedName: string;
  visibility: 'private';
  entries: LibraryEntry[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface AppendResult {
  collection: LibraryCollection;
  added: number;
  duplicates: number;
}
export interface LibraryRepository {
  create(owner: string, name: string): Promise<LibraryCollection>;
  get(owner: string, name: string): Promise<LibraryCollection>;
  list(owner: string): Promise<LibraryCollection[]>;
  delete(owner: string, name: string): Promise<void>;
  rename(
    owner: string,
    name: string,
    newName: string,
  ): Promise<LibraryCollection>;
  append(
    owner: string,
    name: string,
    tracks: SavedTrack[],
    importSource?: LibraryEntry['importSource'],
  ): Promise<AppendResult>;
  remove(
    owner: string,
    name: string,
    position: number,
  ): Promise<LibraryCollection>;
  move(
    owner: string,
    name: string,
    from: number,
    to: number,
  ): Promise<LibraryCollection>;
  clear(owner: string, name: string): Promise<LibraryCollection>;
  liked(owner: string): Promise<LibraryCollection>;
  like(
    owner: string,
    track: SavedTrack,
  ): Promise<{ added: boolean; collection: LibraryCollection }>;
  unlike(owner: string, identity: string): Promise<boolean>;
  clearLiked(owner: string): Promise<void>;
}
export function playlistName(value: string): {
  name: string;
  normalizedName: string;
} {
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (
    !name ||
    name.length > 64 ||
    /[\p{Cc}\p{Cf}]/u.test(value) ||
    normalized(name) === 'liked songs' ||
    name.startsWith('$')
  )
    throw new LibraryError(
      'PLAYLIST_NAME_INVALID',
      'Use a playlist name of 1–64 characters; Liked Songs is reserved.',
    );
  return { name, normalizedName: normalized(name) };
}
const entrySchema = new mongoose.Schema<LibraryEntry>(
  {
    id: { type: String, required: true },
    fingerprint: { type: String, required: true },
    track: {
      type: Object,
      required: true,
      validate: (v: unknown) => savedSchema.strict().safeParse(v).success,
    },
    addedAt: { type: Date, required: true },
    importSource: { provider: String, collectionId: String },
  },
  { _id: false },
);
export const librarySchema = new mongoose.Schema<LibraryCollection>(
  {
    id: { type: String, required: true, unique: true },
    ownerUserId: { type: String, required: true },
    kind: { type: String, enum: ['playlist', 'liked'], required: true },
    name: { type: String, required: true, maxlength: 64 },
    normalizedName: { type: String, required: true },
    visibility: { type: String, enum: ['private'], default: 'private' },
    entries: {
      type: [entrySchema],
      default: [],
      validate: (entries: LibraryEntry[]) =>
        entries.length <= 1000 &&
        new Set(entries.map((e) => e.fingerprint)).size === entries.length,
    },
    version: { type: Number, required: true, default: 0, min: 0 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
);
librarySchema.index({ ownerUserId: 1, normalizedName: 1 }, { unique: true });
librarySchema.index({ ownerUserId: 1, kind: 1, createdAt: 1, id: 1 });
const likedKey = '$liked';
export class MongoLibraryRepository implements LibraryRepository {
  private readonly model: Model<LibraryCollection>;
  private readonly maxEntries: number;
  constructor(connection: Connection, options: { maxEntries?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 200;
    if (
      !Number.isInteger(this.maxEntries) ||
      this.maxEntries < 1 ||
      this.maxEntries > 1000
    )
      throw new Error('Library size limit must be 1–1000.');
    this.model =
      (connection.models?.KairoLibraryCollection as
        Model<LibraryCollection> | undefined) ??
      connection.model<LibraryCollection>(
        'KairoLibraryCollection',
        librarySchema,
      );
  }
  async initialize(): Promise<void> {
    await this.model.init();
  }
  private make(
    owner: string,
    name: string,
    normalizedName: string,
    kind: LibraryCollection['kind'],
  ): LibraryCollection {
    if (!owner || owner.length > 100)
      throw new LibraryError('LIBRARY_OWNER_INVALID', 'A user is required.');
    const now = new Date();
    return {
      id: randomUUID(),
      ownerUserId: owner,
      name,
      normalizedName,
      kind,
      visibility: 'private',
      entries: [],
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
  async create(owner: string, name: string): Promise<LibraryCollection> {
    const names = playlistName(name);
    const record = this.make(
      owner,
      names.name,
      names.normalizedName,
      'playlist',
    );
    try {
      await this.model.create(record);
      return record;
    } catch (error) {
      this.rethrow(error);
    }
  }
  private rethrow(error: unknown): never {
    if ((error as { code?: number })?.code === 11000)
      throw new LibraryError(
        'PLAYLIST_ALREADY_EXISTS',
        'You already have a playlist with that name.',
      );
    throw error;
  }
  private async read(owner: string, key: string): Promise<LibraryCollection> {
    const record = await this.model
      .findOne({ ownerUserId: owner, normalizedName: key })
      .lean()
      .exec();
    if (!record)
      throw new LibraryError('PLAYLIST_NOT_FOUND', 'Playlist not found.');
    return record;
  }
  get(owner: string, name: string): Promise<LibraryCollection> {
    return this.read(owner, playlistName(name).normalizedName);
  }
  async list(owner: string): Promise<LibraryCollection[]> {
    return this.model
      .find({ ownerUserId: owner, kind: 'playlist' })
      .sort({ createdAt: 1, id: 1 })
      .lean()
      .exec();
  }
  async delete(owner: string, name: string): Promise<void> {
    const result = await this.model
      .deleteOne({
        ownerUserId: owner,
        normalizedName: playlistName(name).normalizedName,
        kind: 'playlist',
      })
      .exec();
    if (!result.deletedCount)
      throw new LibraryError('PLAYLIST_NOT_FOUND', 'Playlist not found.');
  }
  private async mutate<T>(
    owner: string,
    key: string,
    change: (record: LibraryCollection) => T,
  ): Promise<{ collection: LibraryCollection; value: T }> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const record = await this.read(owner, key);
      const value = change(record);
      try {
        const updated = await this.model
          .findOneAndUpdate(
            { id: record.id, ownerUserId: owner, version: record.version },
            {
              $set: {
                entries: record.entries,
                name: record.name,
                normalizedName: record.normalizedName,
                updatedAt: new Date(),
              },
              $inc: { version: 1 },
            },
            { returnDocument: 'after', runValidators: true, lean: true },
          )
          .exec();
        if (updated) return { collection: updated, value };
      } catch (error) {
        this.rethrow(error);
      }
    }
    throw new LibraryError(
      'LIBRARY_BUSY',
      'Your library changed repeatedly. Please retry.',
    );
  }
  async rename(
    owner: string,
    name: string,
    newName: string,
  ): Promise<LibraryCollection> {
    const next = playlistName(newName);
    return (
      await this.mutate(owner, playlistName(name).normalizedName, (r) => {
        r.name = next.name;
        r.normalizedName = next.normalizedName;
      })
    ).collection;
  }
  private async appendKey(
    owner: string,
    key: string,
    tracks: SavedTrack[],
    importSource?: LibraryEntry['importSource'],
  ): Promise<AppendResult> {
    const snapshots = tracks.map((t) => saveTrack(t));
    const result = await this.mutate(owner, key, (r) => {
      const ids = new Set(r.entries.map((e) => e.fingerprint));
      let added = 0;
      for (const track of snapshots) {
        const fingerprint = trackIdentity(track);
        if (ids.has(fingerprint)) continue;
        if (r.entries.length >= this.maxEntries)
          throw new LibraryError(
            'PLAYLIST_FULL',
            `The collection is limited to ${this.maxEntries} tracks.`,
          );
        ids.add(fingerprint);
        added++;
        r.entries.push({
          id: randomUUID(),
          fingerprint,
          track,
          addedAt: new Date(),
          ...(importSource ? { importSource } : {}),
        });
      }
      return added;
    });
    return {
      collection: result.collection,
      added: result.value,
      duplicates: snapshots.length - result.value,
    };
  }
  append(
    owner: string,
    name: string,
    tracks: SavedTrack[],
    importSource?: LibraryEntry['importSource'],
  ): Promise<AppendResult> {
    return this.appendKey(
      owner,
      playlistName(name).normalizedName,
      tracks,
      importSource,
    );
  }
  private position(entries: LibraryEntry[], value: number): void {
    if (!Number.isInteger(value) || value < 1 || value > entries.length)
      throw new LibraryError(
        'INVALID_PLAYLIST_POSITION',
        'Choose a valid one-based track position.',
      );
  }
  async remove(
    owner: string,
    name: string,
    position: number,
  ): Promise<LibraryCollection> {
    return (
      await this.mutate(owner, playlistName(name).normalizedName, (r) => {
        this.position(r.entries, position);
        r.entries.splice(position - 1, 1);
      })
    ).collection;
  }
  async move(
    owner: string,
    name: string,
    from: number,
    to: number,
  ): Promise<LibraryCollection> {
    return (
      await this.mutate(owner, playlistName(name).normalizedName, (r) => {
        this.position(r.entries, from);
        this.position(r.entries, to);
        const [entry] = r.entries.splice(from - 1, 1);
        r.entries.splice(to - 1, 0, entry!);
      })
    ).collection;
  }
  async clear(owner: string, name: string): Promise<LibraryCollection> {
    return (
      await this.mutate(owner, playlistName(name).normalizedName, (r) => {
        r.entries = [];
      })
    ).collection;
  }
  async liked(owner: string): Promise<LibraryCollection> {
    const record = await this.model
      .findOneAndUpdate(
        { ownerUserId: owner, normalizedName: likedKey },
        { $setOnInsert: this.make(owner, 'Liked Songs', likedKey, 'liked') },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          lean: true,
        },
      )
      .exec();
    if (!record)
      throw new LibraryError(
        'LIBRARY_UNAVAILABLE',
        'The library is unavailable.',
      );
    return record;
  }
  async like(
    owner: string,
    track: SavedTrack,
  ): Promise<{ added: boolean; collection: LibraryCollection }> {
    await this.liked(owner);
    const result = await this.appendKey(owner, likedKey, [track]);
    return { added: result.added === 1, collection: result.collection };
  }
  async unlike(owner: string, identity: string): Promise<boolean> {
    await this.liked(owner);
    return (
      await this.mutate(owner, likedKey, (r) => {
        const index = r.entries.findIndex((e) => e.fingerprint === identity);
        if (index < 0) return false;
        r.entries.splice(index, 1);
        return true;
      })
    ).value;
  }
  async clearLiked(owner: string): Promise<void> {
    await this.liked(owner);
    await this.mutate(owner, likedKey, (r) => {
      r.entries = [];
    });
  }
}
