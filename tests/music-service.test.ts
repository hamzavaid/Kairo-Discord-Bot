import { describe, expect, it, vi } from 'vitest';
import {
  MusicError,
  type KairoMusicEngine,
  type Track,
} from '@kairo/music-engine';
import { KairoMusicClient } from '../apps/bot/src/services/KairoMusicClient.js';
import { MusicService } from '../apps/bot/src/services/MusicService.js';

const track = (id: string): Track => ({
  id: `fixture:${id}`,
  sourceId: id,
  sourceProvider: 'fixture',
  title: `Song ${id}`,
  artists: [{ name: 'Artist' }],
  isLive: false,
  requestedBy: 'user',
  provenance: { input: id, parsedBy: 'fixture' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
});
const target = {
  guildId: 'guild',
  channelId: 'voice',
  adapterCreator: (() => ({})) as never,
};

function setup() {
  const engine = {
    parse: vi.fn().mockResolvedValue({ kind: 'track', track: track('one') }),
    preparePlayable: vi.fn(async (value: Track) => value),
    enqueue: vi.fn().mockResolvedValue({
      guildId: 'guild',
      current: { track: track('one') },
      upcoming: [],
    }),
    connectVoice: vi.fn().mockResolvedValue({ state: 'PLAYING' }),
    canPlay: vi.fn().mockReturnValue(true),
    getPlayback: vi.fn().mockReturnValue({ state: 'DISCONNECTED' }),
    getQueue: vi.fn().mockReturnValue({ current: undefined, upcoming: [] }),
    pause: vi.fn().mockResolvedValue({ state: 'PAUSED' }),
    resume: vi.fn().mockResolvedValue({ state: 'PLAYING' }),
    skip: vi.fn().mockResolvedValue({ current: undefined, upcoming: [] }),
    stop: vi.fn().mockResolvedValue({ current: undefined, upcoming: [] }),
  };
  const service = new MusicService(
    new KairoMusicClient(engine as unknown as KairoMusicEngine),
  );
  return { engine, service };
}

describe('Phase 6 MusicService', () => {
  it('queues canonical sequences atomically without eagerly preparing every stream', async () => {
    const { engine, service } = setup();
    const enqueueMany = vi.fn(async () => ({ guildId: 'guild', upcoming: [] }));
    Object.assign(engine, { enqueueMany });
    await service.playTracks({
      guildId: 'guild',
      userId: 'user',
      voiceTarget: target,
      tracks: [track('one'), track('two')],
    });
    expect(enqueueMany).toHaveBeenCalledWith({
      guildId: 'guild',
      enqueuedBy: 'user',
      tracks: [track('one'), track('two')],
    });
    expect(engine.preparePlayable).not.toHaveBeenCalled();
    expect(engine.connectVoice).toHaveBeenCalledWith(target);
    await expect(
      service.playTracks({
        guildId: 'guild',
        userId: 'user',
        voiceTarget: target,
        tracks: [],
      }),
    ).rejects.toMatchObject({ code: 'COLLECTION_EMPTY' });
  });
  it('parses, connects, and enqueues a track through the public engine API', async () => {
    const { engine, service } = setup();
    const result = await service.play({
      guildId: 'guild',
      userId: 'user',
      query: 'fixture track',
      voiceTarget: target,
    });
    expect(engine.parse).toHaveBeenCalledWith({
      input: 'fixture track',
      guildId: 'guild',
      requestedBy: 'user',
    });
    expect(engine.connectVoice).toHaveBeenCalledWith(target);
    expect(engine.preparePlayable).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fixture:one' }),
    );
    expect(engine.enqueue).toHaveBeenCalledWith({
      guildId: 'guild',
      enqueuedBy: 'user',
      track: expect.objectContaining({ id: 'fixture:one' }),
    });
    expect(result.track.title).toBe('Song one');
  });

  it('enqueues the verified playable candidate returned by the engine', async () => {
    const { engine, service } = setup();
    const candidate = {
      ...track('video'),
      sourceProvider: 'youtube-sr',
      sourceId: 'dQw4w9WgXcQ',
    };
    engine.preparePlayable.mockResolvedValue(candidate);
    await service.play({
      guildId: 'guild',
      userId: 'user',
      query: 'catalog song',
      voiceTarget: target,
    });
    expect(engine.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ track: candidate }),
    );
  });

  it('queues a search result while already playing without reconnecting', async () => {
    const { engine, service } = setup();
    await service.play({
      guildId: 'guild',
      userId: 'user',
      query: 'song one',
      voiceTarget: target,
    });
    engine.connectVoice.mockClear();
    engine.parse.mockResolvedValue({
      kind: 'search',
      candidates: [track('two')],
    });
    engine.getPlayback.mockReturnValue({ state: 'PLAYING' });
    engine.getQueue.mockReturnValue({
      current: { track: track('one') },
      upcoming: [],
    });
    engine.enqueue.mockResolvedValue({
      current: { track: track('one') },
      upcoming: [{ track: track('two') }],
    });
    const result = await service.play({
      guildId: 'guild',
      userId: 'user',
      query: 'song two',
      voiceTarget: target,
    });
    expect(engine.connectVoice).not.toHaveBeenCalled();
    expect(result.position).toBe(1);
  });

  it('resolves info without enqueueing or connecting and forwards controls', async () => {
    const { engine, service } = setup();
    expect((await service.info('query', 'guild', 'user')).title).toBe(
      'Song one',
    );
    expect(engine.enqueue).not.toHaveBeenCalled();
    expect(engine.connectVoice).not.toHaveBeenCalled();
    await service.pause('guild');
    await service.resume('guild');
    await service.skip('guild');
    await service.stop('guild');
    expect(engine.pause).toHaveBeenCalledWith('guild');
    expect(engine.resume).toHaveBeenCalledWith('guild');
    expect(engine.skip).toHaveBeenCalledWith('guild');
    expect(engine.stop).toHaveBeenCalledWith('guild');
  });

  it('rejects metadata without a playable source before connecting or enqueueing', async () => {
    const { engine, service } = setup();
    engine.canPlay.mockReturnValue(false);
    await expect(
      service.play({
        guildId: 'guild',
        userId: 'user',
        query: 'unplayable',
        voiceTarget: target,
      }),
    ).rejects.toMatchObject({ code: 'STREAM_UNAVAILABLE' });
    expect(engine.connectVoice).not.toHaveBeenCalled();
    expect(engine.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a second play request from another voice channel', async () => {
    const { engine, service } = setup();
    await service.play({
      guildId: 'guild',
      userId: 'user',
      query: 'one',
      voiceTarget: target,
    });
    engine.getPlayback.mockReturnValue({ state: 'PLAYING' });
    engine.enqueue.mockClear();
    await expect(
      service.play({
        guildId: 'guild',
        userId: 'other',
        query: 'two',
        voiceTarget: { ...target, channelId: 'other-voice' },
      }),
    ).rejects.toMatchObject({ code: 'WRONG_VOICE_CHANNEL' });
    expect(engine.enqueue).not.toHaveBeenCalled();
  });
});

it('maps unsupported collection URLs into the collection error contract without enqueueing', async () => {
  const { engine, service } = setup();
  engine.parse.mockRejectedValueOnce(
    new MusicError('UNSUPPORTED_PROVIDER', 'raw provider detail'),
  );
  await expect(
    service.collection('https://untrusted.invalid', 'guild', 'user'),
  ).rejects.toMatchObject({ code: 'COLLECTION_UNSUPPORTED' });
  expect(engine.enqueue).not.toHaveBeenCalled();
  expect(engine.connectVoice).not.toHaveBeenCalled();
});

it('returns bounded canonical info results through the parser without preparing streams', async () => {
  const { engine, service } = setup();
  engine.parse.mockResolvedValueOnce({
    kind: 'search',
    candidates: [track('one'), track('two'), track('three')],
  });
  expect(
    (await service.infoResults('song', 'guild', 'user', 2)).map((t) => t.title),
  ).toEqual(['Song one', 'Song two']);
  expect(engine.parse).toHaveBeenCalledWith({
    input: 'song',
    guildId: 'guild',
    requestedBy: 'user',
    maxResults: 2,
  });
  expect(engine.preparePlayable).not.toHaveBeenCalled();
  expect(engine.connectVoice).not.toHaveBeenCalled();
  expect(engine.enqueue).not.toHaveBeenCalled();
  engine.parse.mockResolvedValueOnce({ kind: 'track', track: track('one') });
  expect(await service.infoResults('url', 'guild', 'user', 5)).toHaveLength(1);
  for (const count of [0, 26, 1.5])
    await expect(
      service.infoResults('query', 'guild', 'user', count),
    ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
  engine.parse.mockResolvedValueOnce({ kind: 'search', candidates: [] });
  await expect(
    service.infoResults('none', 'guild', 'user', 2),
  ).rejects.toMatchObject({ code: 'NO_SEARCH_RESULTS' });
});

it('exposes player snapshots and forwards previous through the public engine adapter', async () => {
  const { engine, service } = setup();
  const previous = vi.fn(async () => ({
    current: { track: track('prior') },
    upcoming: [],
  }));
  Object.assign(engine, { previous });
  expect(service.playback('guild')).toEqual({ state: 'DISCONNECTED' });
  expect(await service.previous('guild')).toMatchObject({
    current: { track: { title: 'Song prior' } },
  });
  expect(previous).toHaveBeenCalledWith('guild');
});
