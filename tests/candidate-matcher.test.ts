import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createKairoMusicEngine,
  MusicError,
  type Track,
} from '@kairo/music-engine';
import { detectVersions } from '../packages/music-engine/src/matching/versionDetection.js';

interface Entry {
  name: string;
  title: string;
  artists: { name: string }[];
  durationMs?: number;
  album?: { title: string };
}
const corpus = JSON.parse(
  readFileSync(
    join(import.meta.dirname, 'fixtures/matching/corpus.json'),
    'utf8',
  ),
) as { source: Entry; positive: Entry[]; negative: Entry[] };
function track(
  entry: Entry,
  provider = 'spotify',
  id = entry.name ?? 'source',
): Track {
  return {
    id: `${provider}:${id}`,
    sourceProvider: provider,
    sourceId: id,
    title: entry.title,
    artists: entry.artists,
    ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
    ...(entry.album ? { album: entry.album } : {}),
    isLive: false,
    requestedBy: 'user',
    provenance: { input: 'fixture', parsedBy: provider },
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}
const source = track(corpus.source);

describe('candidate matcher fixture corpus', () => {
  const engine = createKairoMusicEngine({ fixtureTracks: [] });
  it.each(corpus.positive)('accepts $name', (entry) => {
    const result = engine.matchCandidates({
      source,
      candidates: [track(entry, 'youtube-sr')],
    });
    expect(result.score).toBeGreaterThanOrEqual(0.82);
    expect(result.candidate.provenance).toMatchObject({
      matchedFrom: 'spotify',
      originalSourceProvider: 'spotify',
      selectedProviderId: 'youtube-sr',
      confidence: result.score,
    });
    expect(result.signals.titleSimilarity).toBeGreaterThan(0.8);
  });
  it.each(corpus.negative)('rejects $name', (entry) => {
    expect(() =>
      engine.matchCandidates({
        source,
        candidates: [track(entry, 'youtube-sr')],
      }),
    ).toThrowError(MusicError);
    expect(() =>
      engine.matchCandidates({
        source,
        candidates: [track(entry, 'youtube-sr')],
      }),
    ).toThrowError(expect.objectContaining({ code: 'NO_RELIABLE_MATCH' }));
  });

  it('handles multiple artists and featured artist credit', () => {
    const multi = track({
      name: 'multi',
      title: 'Night Drive feat. Guest',
      artists: [{ name: 'Main Artist' }, { name: 'Guest' }],
      durationMs: 200000,
    });
    const candidate = track(
      {
        name: 'multi-candidate',
        title: 'Night Drive (feat Guest)',
        artists: [{ name: 'MAIN ARTIST' }, { name: 'Guest' }],
        durationMs: 201000,
      },
      'youtube-api',
    );
    expect(
      engine.matchCandidates({ source: multi, candidates: [candidate] }).score,
    ).toBeGreaterThanOrEqual(0.82);
  });

  it('uses configured artist aliases and Unicode folding', () => {
    const aliasSource = track({
      name: 'alias-source',
      title: 'Try',
      artists: [{ name: 'P!nk' }],
      durationMs: 240000,
    });
    const aliasCandidate = track(
      {
        name: 'alias-candidate',
        title: 'Try',
        artists: [{ name: 'Pink' }],
        durationMs: 240000,
      },
      'musicbrainz',
    );
    const matcher = createKairoMusicEngine({
      artistAliases: { 'p nk': 'pink' },
    });
    expect(
      matcher.matchCandidates({
        source: aliasSource,
        candidates: [aliasCandidate],
      }).score,
    ).toBeGreaterThanOrEqual(0.82);
  });

  it('matches Unicode punctuation and accents after normalization', () => {
    const unicodeSource = track({
      name: 'unicode-source',
      title: 'Déjà Vu',
      artists: [{ name: 'Beyoncé' }],
      durationMs: 240000,
    });
    const unicodeCandidate = track(
      {
        name: 'unicode-candidate',
        title: 'DEJA—VU!',
        artists: [{ name: 'Beyonce' }],
        durationMs: 240000,
      },
      'youtube-sr',
    );
    expect(
      engine.matchCandidates({
        source: unicodeSource,
        candidates: [unicodeCandidate],
      }).score,
    ).toBeGreaterThanOrEqual(0.82);
  });

  it('reduces confidence for a remaster and detects a live flag', () => {
    const original = track(
      { ...corpus.source, name: 'original' },
      'youtube-sr',
    );
    const remaster = track(
      {
        ...corpus.source,
        name: 'remaster',
        title: 'One More Time (Remastered)',
      },
      'youtube-sr',
    );
    const base = engine.matchCandidates({ source, candidates: [original] });
    const changed = engine.matchCandidates({ source, candidates: [remaster] });
    expect(changed.score).toBeLessThan(base.score);
    expect(detectVersions({ ...original, isLive: true }).has('live')).toBe(
      true,
    );
    expect(
      detectVersions({ ...original, title: 'Live and Let Die' }).has('live'),
    ).toBe(false);
  });

  it.each([
    ['live', 'Live'],
    ['remix', 'Club Remix'],
    ['remaster', 'Remastered'],
    ['acoustic', 'Acoustic'],
    ['instrumental', 'Instrumental'],
    ['karaoke', 'Karaoke'],
    ['cover', 'Cover'],
    ['sped-up', 'Sped Up'],
    ['slowed', 'Slowed Down'],
    ['nightcore', 'Nightcore'],
    ['radio-edit', 'Radio Edit'],
    ['extended-mix', 'Extended Mix'],
    ['demo', 'Demo'],
  ] as const)('detects %s versions', (marker, suffix) => {
    expect(
      detectVersions(
        track({
          name: marker,
          title: `One More Time (${suffix})`,
          artists: [{ name: 'Daft Punk' }],
        }),
      ).has(marker),
    ).toBe(true);
  });

  it('uses album only as a small tie breaker', () => {
    const matching = track(
      { ...corpus.source, name: 'album-match', album: { title: 'Discovery' } },
      'musicbrainz',
    );
    const different = track(
      {
        ...corpus.source,
        name: 'album-other',
        album: { title: 'Unrelated Release' },
      },
      'youtube-api',
    );
    const result = engine.matchCandidates({
      source,
      candidates: [different, matching],
    });
    expect(result.candidate.sourceId).toBe('album-match');
    expect(result.signals.albumSimilarity).toBe(1);
    expect(
      engine.matchCandidates({ source, candidates: [different] }).score,
    ).toBeGreaterThanOrEqual(0.82);
  });

  it('ranks every candidate and resolves equal scores deterministically', () => {
    const weak = track(
      {
        name: 'weak',
        title: 'One More Time',
        artists: [{ name: 'Daft Punk' }],
        durationMs: 330000,
      },
      'youtube-sr',
    );
    const a = track(
      {
        name: 'a',
        title: 'One More Time',
        artists: [{ name: 'Daft Punk' }],
        durationMs: 320000,
      },
      'musicbrainz',
    );
    const b = track(
      {
        name: 'b',
        title: 'One More Time',
        artists: [{ name: 'Daft Punk' }],
        durationMs: 320000,
      },
      'youtube-api',
    );
    expect(
      engine.matchCandidates({ source, candidates: [weak, b, a] }).candidate.id,
    ).toBe(a.id);
    expect(
      engine.matchCandidates({ source, candidates: [a, weak, b] }).candidate.id,
    ).toBe(a.id);
  });

  it('honors configurable threshold and quality without provider-specific matcher code', () => {
    const candidate = track(
      { ...corpus.positive[0]!, album: { title: 'Discovery' } },
      'youtube-api',
    );
    const strict = createKairoMusicEngine({
      matchThreshold: 0.99,
      providerQuality: { 'youtube-api': 1 },
    });
    expect(
      strict.matchCandidates({ source, candidates: [candidate] }).score,
    ).toBeGreaterThanOrEqual(0.99);
    expect(() => createKairoMusicEngine({ matchThreshold: 1.1 })).toThrow();
  });

  it('reports safe diagnostics and typed rejection for an empty set', () => {
    const debug = vi.fn();
    const observe = createKairoMusicEngine({ matcherLogger: { debug } });
    expect(() =>
      observe.matchCandidates({ source, candidates: [], requestId: 'r1' }),
    ).toThrowError(
      expect.objectContaining({
        code: 'NO_RELIABLE_MATCH',
        correlationId: 'r1',
      }),
    );
    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateCount: 0,
        rejectionReason: 'no_candidates',
      }),
      expect.any(String),
    );
    expect(JSON.stringify(debug.mock.calls)).not.toContain('One More Time');
  });
});
