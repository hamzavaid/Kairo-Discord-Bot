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
      'voice',
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

it('rejects source preparation completed after shutdown instead of creating an orphan session', async () => {
  const { service, music } = setup();
  let finish!: (tracks: (typeof libraryTrack)[]) => void;
  music.infoResults.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const pending = service.create({
    guildId: 'g',
    channelId: 'c',
    hostId: 'h',
    kind: 'musictrivia',
  });
  await vi.waitFor(() => expect(music.infoResults).toHaveBeenCalled());
  await service.close();
  finish([libraryTrack]);
  await expect(pending).rejects.toMatchObject({ code: 'GAME_FINISHED' });
});
it('requires trivia guessers to be in the preview voice channel and cleans late-round audio immediately', async () => {
  const { service, music, advance } = setup();
  const game = await service.create({
    guildId: 'g',
    channelId: 'c',
    hostId: 'host',
    kind: 'musictrivia',
    rounds: 1,
  });
  await service.start(game, 'host', {
    guildId: 'g',
    channelId: 'v',
    adapterCreator: (() => ({})) as never,
  });
  await expect(
    service.act(
      game,
      'host',
      { type: 'guess', text: game.triviaTrack().title },
      game.view().revision,
      'other',
    ),
  ).rejects.toMatchObject({ code: 'GAME_FORBIDDEN' });
  advance(31000);
  await expect(
    service.act(
      game,
      'host',
      { type: 'guess', text: 'late' },
      game.view().revision,
      'v',
    ),
  ).rejects.toThrow();
  expect(music.stopPreview).toHaveBeenCalled();
  await service.close();
});

it('passes only normalized game options and answer DTOs into the game domain', async () => {
  const { service } = setup();
  const game = await service.create({
    guildId: 'g',
    channelId: 'c',
    hostId: 'h',
    kind: 'musictrivia',
    source: 'playlist',
    playlist: 'Private name',
  });
  expect(game.options).not.toHaveProperty('playlist');
  expect(game.options).not.toHaveProperty('source');
  expect(game.options).not.toHaveProperty('url');
  await service.close();
});

it('uses the configured trivia limit for omitted rounds and does not block other games', async () => {
  const { service, repo } = setup();
  repo.settings = async () => ({ ...DEFAULT_GAME_SETTINGS, maxRounds: 1 });
  const trivia = await service.create({
    guildId: 'g',
    channelId: 'c',
    hostId: 'h',
    kind: 'musictrivia',
  });
  expect(trivia.options.rounds).toBe(1);
  await expect(
    service.create({
      guildId: 'g',
      channelId: 'other',
      hostId: 'h',
      kind: 'rps',
    }),
  ).resolves.toBeDefined();
  await service.close();
});
it('drains admitted statistics writes before shutdown completes', async () => {
  const { service, repo, advance } = setup();
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  repo.record.mockImplementation(() => pending);
  const game = await service.create({
    guildId: 'g',
    channelId: 'c',
    hostId: 'h',
    kind: 'rps',
    bestOf: 1,
  });
  game.join('b');
  await service.start(game, 'h');
  await service.act(
    game,
    'h',
    { type: 'rps', choice: 'rock' },
    game.view().revision,
  );
  await service.act(
    game,
    'b',
    { type: 'rps', choice: 'scissors' },
    game.view().revision,
  );
  advance(4000);
  const finishing = service.tick(game);
  await vi.waitFor(() => expect(repo.record).toHaveBeenCalled());
  let closed = false;
  const closing = service.close().then(() => {
    closed = true;
  });
  await new Promise((r) => setImmediate(r));
  expect(closed).toBe(false);
  release();
  await Promise.all([finishing, closing]);
  expect(closed).toBe(true);
});
