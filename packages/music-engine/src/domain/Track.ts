export interface ArtistRef {
  name: string;
  id?: string;
}

export interface AlbumRef {
  title: string;
  id?: string;
}

export interface TrackProvenance {
  input: string;
  parsedBy: string;
  matchedFrom?: string;
  confidence?: number;
  originalSourceProvider?: string;
  selectedProviderId?: string;
  matchSignals?: {
    titleSimilarity: number;
    artistSimilarity: number;
    durationSimilarity: number;
    albumSimilarity: number;
    providerQuality: number;
    versionCompatibility: number;
  };
}

export interface Track {
  id: string;
  title: string;
  artists: ArtistRef[];
  durationMs?: number;
  artworkUrl?: string;
  canonicalUrl?: string;
  sourceProvider: string;
  sourceId?: string;
  isLive: boolean;
  requestedBy: string;
  explicit?: boolean;
  album?: AlbumRef;
  provenance: TrackProvenance;
  createdAt: Date;
}
