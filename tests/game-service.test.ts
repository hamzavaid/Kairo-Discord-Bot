import { describe, expect, it, vi } from 'vitest';
import { GameService } from '../apps/bot/src/services/GameService.js';
import { DEFAULT_GAME_SETTINGS } from '@kairo/data';
import { libraryTrack } from './helpers/libraryModel.js';
function setup() {
  const repo = {
    settings: async () => DEFAULT_GAME_SETTINGS,
    record: vi.fn(),
    leaderboard: vi.fn(),
    setSettings: vi.fn(),
  };
  const music = {
    infoResults: vi.fn(async () => [
      libraryTrack,
      { ...libraryTrack, id: 'two', sourceId: 'second', title: 'Second' },
    ]),
    collection: vi.fn(),
    acquirePreview: vi.fn(async () => ({ leaseId: 'lease' })),
    playPreview: vi.fn(),
    stopPreview: vi.fn(),
    releasePreview: vi.fn(),
  };
  const library = {
    get: vi.fn(async () => ({ entries: [{ track: libraryTrack }] })),
    liked: vi.fn(async () => ({ entries: [{ track: libraryTrack }] })),
  };
  let now = 0;
  const service = new GameService(
    repo as never,
    music as never,
    library as never,
    () => now,
    () => 0.5,
  );
  return {
    service,
    repo,
    music,
    library,
    advance: (n: number) => {
      now = n;
    },
  };
}
describe('game services and canonical trivia boundary', () => {
  it('loads only the host private library and refuses private public-import sources', async () => {
    const { service, music, library } = setup();
    await service.create({
      guildId: 'g',
      channelId: 'c',
      hostId: 'host',
      kind: 'musictrivia',
      source: 'playlist',
      playlist: 'Mine',
    });
    expect(library.get).toHaveBeenCalledWith('host', 'Mine');
    music.collection.mockResolvedValueOnce({
      sourceProvider: 'spotify',
      visibility: 'private',
      tracks: [libraryTrack],
    } as never);
    await expect(
      service.create({
        guildId: 'g',
        channelId: 'other',
        hostId: 'host',
        kind: 'musictrivia',
        source: 'public',
        url: 'https://open.spotify.com/playlist/x',
      }),
    ).rejects.toMatchObject({ code: 'GAME_FORBIDDEN' });
    expect(music.acquirePreview).not.toHaveBeenCalled();
  });
  it('replaces unavailable previews, hides answers during guessing and cleans audio at reveal/end', async () => {
    const { service, music, repo, advance } = setup();
    music.playPreview.mockRejectedValueOnce(Error('unavailable'));
    const game = await service.create({
      guildId: 'g',
      channelId: 'c',
      hostId: 'host',
      kind: 'musictrivia',
      source: 'catalog',
      rounds: 1,
    });
    await service.start(game, 'host', {
      guildId: 'g',
      channelId: 'voice',
      adapterCreator: (() => ({})) as never,
    });
    expect(music.playPreview).toHaveBeenCalledTimes(2);
    expect(game.view().phase).toBe('active');
    expect(JSON.stringify(game.view())).not.toContain('Second');
    const track = game.triviaTrack();
    await service.act(
      game,
      'host',
      { type: 'guess', text: track.title },
      game.view().revision,
    );
    expect(music.stopPreview).toHaveBeenCalled();
    advance(4000);
    await service.tick(game);
    expect(game.view().phase).toBe('finished');
    expect(repo.record).toHaveBeenCalledOnce();
    expect(music.releasePreview).toHaveBeenCalledOnce();
    await service.tick(game);
    expect(repo.record).toHaveBeenCalledOnce();
    await service.close();
  });
  it('starts/finishes ordinary games without music and shuts down abandoned preview leases', async () => {
    const { service, music, advance } = setup();
    const game = await service.create({
      guildId: 'g',
      channelId: 'c',
      hostId: 'host',
      kind: 'rps',
      bestOf: 1,
    });
    game.join('other');
    await service.start(game, 'host');
    await service.act(
      game,
      'host',
      { type: 'rps', choice: 'rock' },
      game.view().revision,
    );
    await service.act(
      game,
      'other',
      { type: 'rps', choice: 'scissors' },
      game.view().revision,
    );
    advance(4000);
    await service.tick(game);
    expect(music.acquirePreview).not.toHaveBeenCalled();
    await service.close();
  });
});
