import { describe, expect, it } from 'vitest';
import { createKairoMusicEngine, type ParseResult } from '@kairo/music-engine';

const live = process.env.KAIRO_LIVE_API_TESTS === '1';
if (live) process.loadEnvFile('.env');

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set for live metadata tests.`);
  return value;
}

function musicBrainzContact(): string {
  const configured = required('MUSICBRAINZ_USER_AGENT');
  return /https?:\/\/[^\s)]+/u.exec(configured)?.[0] ?? configured;
}

const context = { guildId: 'live-test', requestedBy: 'live-test' };

function expectSearch(result: ParseResult, provider: string): string {
  expect(result.kind).toBe('search');
  if (result.kind !== 'search') throw new Error('Expected a search result.');
  expect(result.candidates.length).toBeGreaterThan(0);
  const first = result.candidates[0]!;
  expect(first.sourceProvider).toBe(provider);
  expect(first.sourceId).toBeTruthy();
  expect(first.title.trim()).not.toBe('');
  expect(first.artists.length).toBeGreaterThan(0);
  return first.sourceId!;
}

function expectTrack(result: ParseResult, provider: string, id: string): void {
  expect(result.kind).toBe('track');
  if (result.kind !== 'track') throw new Error('Expected a track result.');
  expect(result.track.sourceProvider).toBe(provider);
  expect(result.track.sourceId).toBe(id);
  expect(result.track.title.trim()).not.toBe('');
  expect(result.track.artists.length).toBeGreaterThan(0);
  expect(result.track.provenance.parsedBy).toBe(provider);
}

describe.skipIf(!live)('live metadata APIs (opt in)', () => {
  it('searches and looks up YouTube Data API metadata', async () => {
    const engine = createKairoMusicEngine({
      metadataProvider: 'youtube-api',
      youtubeApi: { apiKey: required('YOUTUBE_API_KEY'), timeoutMs: 15_000 },
    });
    try {
      expectSearch(
        await engine.parse({
          ...context,
          input: 'Rick Astley Never Gonna Give You Up',
          maxResults: 1,
        }),
        'youtube-api',
      );
      const id = 'dQw4w9WgXcQ';
      expectTrack(
        await engine.parse({
          ...context,
          input: `https://www.youtube.com/watch?v=${id}`,
        }),
        'youtube-api',
        id,
      );
    } finally {
      await engine.shutdown();
    }
  }, 35_000);

  it('searches and looks up Spotify Web API track metadata', async () => {
    const engine = createKairoMusicEngine({
      metadataProvider: 'spotify',
      spotify: {
        clientId: required('SPOTIFY_CLIENT_ID'),
        clientSecret: required('SPOTIFY_CLIENT_SECRET'),
        timeoutMs: 15_000,
      },
    });
    try {
      expectSearch(
        await engine.parse({
          ...context,
          input: 'Rick Astley Never Gonna Give You Up',
          maxResults: 1,
        }),
        'spotify',
      );
      const id = '4uLU6hMCjMI75M1A2tKUQC';
      expectTrack(
        await engine.parse({
          ...context,
          input: `https://open.spotify.com/track/${id}`,
        }),
        'spotify',
        id,
      );
    } finally {
      await engine.shutdown();
    }
  }, 35_000);

  it('searches and looks up MusicBrainz recording metadata', async () => {
    const engine = createKairoMusicEngine({
      metadataProvider: 'musicbrainz',
      musicBrainz: {
        contact: musicBrainzContact(),
        timeoutMs: 15_000,
      },
    });
    try {
      const id = expectSearch(
        await engine.parse({
          ...context,
          input: 'Koda Kumi LAST ANGEL',
          maxResults: 1,
        }),
        'musicbrainz',
      );
      expectTrack(
        await engine.parse({
          ...context,
          input: `https://musicbrainz.org/recording/${id}`,
        }),
        'musicbrainz',
        id,
      );
    } finally {
      await engine.shutdown();
    }
  }, 45_000);
});
