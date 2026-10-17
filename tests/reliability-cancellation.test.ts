import { expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { MusicService } from '../apps/bot/src/services/MusicService.js';
import { libraryTrack } from './helpers/libraryModel.js';

it('stop while saved tracks connect cannot enqueue a late collection', async () => {
  let finish!: () => void;
  const client = {
    getPlayback: () => ({ state: 'DISCONNECTED' }),
    connectVoice: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
    disconnectVoice: vi.fn(async () => ({})),
    enqueueMany: vi.fn(),
    stop: vi.fn(async () => ({})),
  };
  const service = new MusicService(client as never);
  const job = service.playTracks({
    guildId: 'g',
    userId: 'u',
    tracks: [libraryTrack],
    voiceTarget: {
      guildId: 'g',
      channelId: 'v',
      adapterCreator: (() => ({})) as never,
    },
  });
  const failure = expect(job).rejects.toMatchObject({
    code: 'PARSER_CANCELLED',
  });
  await vi.waitFor(() => expect(client.connectVoice).toHaveBeenCalled());
  await service.stop('g');
  finish();
  await failure;
  expect(client.enqueueMany).not.toHaveBeenCalled();
  service.close();
});

it('shutdown aborts a parser request and rejects future parses even for a noncooperative adapter', async () => {
  const search = vi.fn(() => new Promise<never>(() => {}));
  const engine = createKairoMusicEngine({ youtubeSr: { search } });
  const work = engine.parse({ input: 'song', guildId: 'g', requestedBy: 'u' });
  const failed = expect(work).rejects.toMatchObject({
    code: 'PARSER_CANCELLED',
  });
  await vi.waitFor(() => expect(search).toHaveBeenCalled());
  await engine.shutdown();
  await failed;
  await expect(
    engine.parse({ input: 'song', guildId: 'g', requestedBy: 'u' }),
  ).rejects.toMatchObject({ code: 'PARSER_CANCELLED' });
});

it('stop during play metadata resolution cannot reconnect or enqueue late results', async () => {
  let finish!: (value: unknown) => void;
  const client = {
    getPlayback: () => ({ state: 'DISCONNECTED' }),
    parse: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
    preparePlayable: vi.fn(async () => libraryTrack),
    canPlay: () => true,
    connectVoice: vi.fn(),
    enqueue: vi.fn(),
    stop: vi.fn(async () => ({})),
  };
  const service = new MusicService(client as never);
  const work = service.play({
    guildId: 'g',
    userId: 'u',
    query: 'song',
    voiceTarget: {
      guildId: 'g',
      channelId: 'v',
      adapterCreator: (() => ({})) as never,
    },
  });
  const failed = expect(work).rejects.toMatchObject({
    code: 'PARSER_CANCELLED',
  });
  await vi.waitFor(() => expect(client.parse).toHaveBeenCalled());
  await service.stop('g');
  finish({ kind: 'track', track: libraryTrack });
  await failed;
  expect(client.connectVoice).not.toHaveBeenCalled();
  expect(client.enqueue).not.toHaveBeenCalled();
});
