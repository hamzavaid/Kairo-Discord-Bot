import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '@kairo/shared';
import {
  addApplicationOwner,
  createBotMusicOptions,
  developerIdsFromEnvironment,
} from '../apps/bot/src/config/music.js';

const base = {
  DISCORD_TOKEN: 'test-token',
  DISCORD_CLIENT_ID: '123456789012345678',
  MONGODB_URI: 'mongodb://localhost:27017/kairo',
};

describe('Phase 6 bot music configuration', () => {
  it('treats a blank optional metadata selection as the default', () => {
    const environment = parseEnvironment({
      ...base,
      KAIRO_METADATA_PROVIDER: '',
    });
    expect(createBotMusicOptions(environment).metadataProvider).toBeUndefined();
  });
  it('uses the selected metadata provider without requiring unused credentials', () => {
    const environment = parseEnvironment({
      ...base,
      KAIRO_METADATA_PROVIDER: 'spotify',
      SPOTIFY_CLIENT_ID: 'client',
      SPOTIFY_CLIENT_SECRET: 'secret',
    });
    expect(createBotMusicOptions(environment)).toMatchObject({
      metadataProvider: 'spotify',
      spotify: { clientId: 'client', clientSecret: 'secret' },
    });
  });

  it('configures a local fixture for a voice smoke test and parses developer IDs', () => {
    const environment = parseEnvironment({
      ...base,
      KAIRO_FIXTURE_AUDIO_PATH: 'C:/music/demo.ogg',
      KAIRO_FIXTURE_AUDIO_INPUT_TYPE: 'ogg/opus',
      KAIRO_DEVELOPER_IDS: '111111111111111111, 222222222222222222',
    });
    expect(createBotMusicOptions(environment)).toMatchObject({
      fixtureTracks: [{ id: 'demo' }],
      fixtureAudio: {
        demo: { path: 'C:/music/demo.ogg', inputType: 'ogg/opus' },
      },
    });
    expect([...developerIdsFromEnvironment(environment)]).toEqual([
      '111111111111111111',
      '222222222222222222',
    ]);
  });

  it('authorizes the application owner even without explicit developer IDs', () => {
    const developers = new Set<string>();
    addApplicationOwner(developers, { id: '111111111111111111' });
    expect(developers.has('111111111111111111')).toBe(true);
    addApplicationOwner(developers, { ownerId: '222222222222222222' });
    expect(developers.has('222222222222222222')).toBe(true);
  });

  it('maps playable-source search and executable configuration without provider credentials', () => {
    const environment = parseEnvironment({
      ...base,
      KAIRO_PLAYABLE_SEARCH_PROVIDER: 'youtube-sr',
      YT_DLP_PATH: 'C:/tools/yt-dlp.exe',
      MUSIC_STREAM_TIMEOUT_MS: '20000',
    });
    expect(createBotMusicOptions(environment)).toMatchObject({
      playableSearchProvider: 'youtube-sr',
      ytDlp: { executable: 'C:/tools/yt-dlp.exe' },
      streamTimeoutMs: 20000,
    });
  });
});
