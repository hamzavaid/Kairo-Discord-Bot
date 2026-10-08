import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { MongoLibraryRepository } from '@kairo/data';
import type { PlaybackSnapshot, QueueSnapshot } from '@kairo/music-engine';
import player from '../apps/bot/src/commands/music/player.js';
import { commandRegistrationData } from '../apps/bot/src/commands/slashCommandHandler.js';
import type { CommandExecutionContext } from '../apps/bot/src/commands/types.js';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';
import { LibraryService } from '../apps/bot/src/services/LibraryService.js';
import { libraryModel, libraryTrack } from './helpers/libraryModel.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
});
async function setup(upcoming = 13) {
  let state: PlaybackSnapshot['state'] = 'PLAYING';
  const entry = (id: number) => ({
    id: `entry-${id}`,
    track: { ...libraryTrack, title: `Song ${id}` },
    enqueuedBy: 'alice',
    enqueuedAt: new Date(),
  });
  const queue: QueueSnapshot = {
    guildId: 'guild',
    generation: 3,
    current: entry(1),
    upcoming: Array.from({ length: upcoming }, (_, i) => entry(i + 2)),
    history: [entry(0)],
    repeatMode: 'off',
  };
  const music = {
    queue: vi.fn(() => structuredClone(queue)),
    playback: vi.fn(() => ({
      guildId: 'guild',
      state,
      current: queue.current,
      generation: queue.generation,
    })),
    assertVoiceChannel: vi.fn((_guild: string, channel: string) => {
      if (channel !== 'voice') throw new Error('wrong voice');
    }),
    pause: vi.fn(async () => {
      state = 'PAUSED';
    }),
    resume: vi.fn(async () => {
      state = 'PLAYING';
    }),
    skip: vi.fn(async () => {
      queue.history.push(queue.current!);
      queue.current = queue.upcoming.shift();
      queue.generation++;
    }),
    shuffle: vi.fn(async () => {
      queue.upcoming.reverse();
    }),
    previous: vi.fn(async () => {
      if (queue.current) queue.upcoming.unshift(queue.current);
      queue.current = queue.history.pop();
      queue.generation++;
    }),
    stop: vi.fn(async () => {
      queue.current = undefined;
      queue.upcoming = [];
      queue.history = [];
      queue.generation++;
      state = 'IDLE';
    }),
    play: vi.fn(async () => ({ track: libraryTrack, position: 2 })),
    info: vi.fn(),
  };
  const { connection } = libraryModel();
  const library = new LibraryService(
    new MongoLibraryRepository(connection),
    music as unknown as MusicService,
  );
  const likeSaved = vi.spyOn(library, 'likeSaved');
  const context = {
    music,
    library,
    onVoiceActivity: vi.fn(),
    reportComponentError: vi.fn(),
    componentErrorMessage: () => 'Safe failure.',
  } as unknown as CommandExecutionContext;
  const collector = Object.assign(new EventEmitter(), {
    stop: vi.fn(() => collector.emit('end')),
  });
  const createCollector = vi.fn((_options: unknown) => {
    void _options;
    return collector;
  });
  let payload: unknown;
  const editReply = vi.fn(async (value: unknown) => {
    payload = value;
    return { createMessageComponentCollector: createCollector };
  });
  const guild = {
    voiceAdapterCreator: vi.fn(),
    voiceStates: { cache: new Map([['alice', { channelId: 'voice' }]]) },
  };
  const interaction = {
    id: 'player-id',
    commandName: 'player',
    guildId: 'guild',
    guild,
    user: { id: 'alice' },
    deferReply: vi.fn(),
    editReply,
  };
  await player.execute(
    interaction as unknown as ChatInputCommandInteraction,
    context,
  );
  cleanups.push(() => collector.emit('end'));
  const controls = () => {
    const found: { custom_id: string; label: string; disabled: boolean }[] = [];
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const item = value as Record<string, unknown>;
      if (item.custom_id) found.push(item as never);
      if (Array.isArray(item.components)) item.components.forEach(walk);
    };
    walk(JSON.parse(JSON.stringify(payload)));
    return found;
  };
  const button = (label: string) => controls().find((c) => c.label === label)!;
  const text = () => JSON.stringify(payload);
  function component(customId: string) {
    const submitted = {
      id: 'submission',
      user: { id: 'alice' },
      guildId: 'guild',
      guild,
      customId: '',
      deferred: false,
      replied: false,
      fields: { getTextInputValue: () => 'Night Drive' },
      deferUpdate: vi.fn(async () => {
        submitted.deferred = true;
      }),
      reply: vi.fn(),
      followUp: vi.fn(),
    };
    const click = {
      id: 'click',
      customId,
      user: { id: 'alice' },
      guildId: 'guild',
      guild,
      deferred: false,
      replied: false,
      isButton: () => true,
      update: vi.fn(async (value: unknown) => {
        click.replied = true;
        payload = value;
      }),
      deferUpdate: vi.fn(async () => {
        click.deferred = true;
      }),
      reply: vi.fn(async () => {}),
      followUp: vi.fn(async () => {}),
      showModal: vi.fn(async (modal: { toJSON(): { custom_id: string } }) => {
        click.replied = true;
        submitted.customId = modal.toJSON().custom_id;
      }),
      awaitModalSubmit: vi.fn(
        async (options: { time: number; filter(i: unknown): boolean }) => {
          expect(options.time).toBeLessThanOrEqual(60000);
          expect(options.filter(submitted)).toBe(true);
          expect(options.filter({ ...submitted, user: { id: 'bob' } })).toBe(
            false,
          );
          return submitted;
        },
      ),
    };
    return { click, submitted };
  }
  async function click(label: string) {
    const result = component(button(label).custom_id);
    collector.emit('collect', result.click);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    return result;
  }
  return {
    music,
    queue,
    context,
    library,
    likeSaved,
    collector,
    createCollector,
    interaction,
    editReply,
    guild,
    controls,
    button,
    text,
    component,
    click,
  };
}

it('registers /player in Music and renders an owned dashboard with artwork, metadata and queue pages', async () => {
  const s = await setup();
  expect(player.category).toBe('Music');
  expect(commandRegistrationData().some((c) => c.name === 'player')).toBe(true);
  expect(s.interaction.deferReply).toHaveBeenCalledWith({
    flags: MessageFlags.Ephemeral,
  });
  expect(s.text()).toContain('hqdefault.jpg');
  expect(s.text()).toContain('Song 1');
  expect(s.text()).toContain('PLAYING');
  expect(s.text()).toContain('3:00');
  expect(s.text()).toContain('Page 1/2');
  const config = s.createCollector.mock.calls[0]![0] as {
    time: number;
    filter(i: unknown): boolean;
  };
  expect(config.time).toBe(300000);
  expect(
    config.filter({
      user: { id: 'bob' },
      customId: s.button('Skip').custom_id,
    }),
  ).toBe(false);
  expect(config.filter({ user: { id: 'alice' }, customId: 'unrelated' })).toBe(
    false,
  );
  await s.click('Next page');
  expect(s.text()).toContain('Page 2/2');
  expect(s.text()).toContain('Song 14');
  s.queue.upcoming = [];
  await s.click('Refresh');
  expect(s.text()).toContain('Page 1/1');
});
it('pauses/resumes, skips, restores previous and stops via MusicService', async () => {
  const s = await setup();
  await s.click('Pause');
  expect(s.music.pause).toHaveBeenCalledWith('guild');
  expect(s.button('Resume')).toBeDefined();
  await s.click('Resume');
  expect(s.music.resume).toHaveBeenCalledWith('guild');
  await s.click('Skip');
  expect(s.music.skip).toHaveBeenCalledWith('guild');
  expect(s.text()).toContain('Song 2');
  await s.click('Previous');
  expect(s.music.previous).toHaveBeenCalledWith('guild');
  await s.click('Stop');
  expect(s.music.stop).toHaveBeenCalledWith('guild');
  expect(s.text()).toContain('Nothing playing');
});
it('likes the displayed track persistently without a second metadata search or playback', async () => {
  const s = await setup();
  const displayed = s.queue.current!.track;
  await s.click('Like song');
  expect(s.likeSaved).toHaveBeenCalledWith('alice', displayed);
  expect((await s.library.liked('alice')).entries).toHaveLength(1);
  expect(s.button('Liked').disabled).toBe(true);
  expect(s.music.info).not.toHaveBeenCalled();
  expect(s.music.play).not.toHaveBeenCalled();
});
it('adds a modal query through the existing play path and rechecks current voice state on submission', async () => {
  const s = await setup();
  const { submitted } = await s.click('Add song');
  expect(submitted.deferUpdate).toHaveBeenCalledOnce();
  expect(s.music.play).toHaveBeenCalledWith(
    expect.objectContaining({
      guildId: 'guild',
      userId: 'alice',
      query: 'Night Drive',
      voiceTarget: expect.objectContaining({ channelId: 'voice' }),
    }),
  );
  expect(s.context.onVoiceActivity).toHaveBeenCalledWith('guild');
  expect(s.text()).toContain('Queued');
});
it('revalidates voice for every transport action and logs safe component failures', async () => {
  const s = await setup();
  s.guild.voiceStates.cache.delete('alice');
  const { click } = await s.click('Skip');
  expect(s.music.skip).not.toHaveBeenCalled();
  expect(s.context.reportComponentError).toHaveBeenCalled();
  expect(JSON.stringify(click.followUp.mock.calls)).toContain('Safe failure.');
});
it('rejects stale track controls and forged non-owner clicks', async () => {
  const s = await setup();
  const stale = s.component(s.button('Like song').custom_id);
  s.queue.current = { ...s.queue.current!, id: 'new-entry' };
  s.queue.generation++;
  s.collector.emit('collect', stale.click);
  await new Promise((resolve) => setImmediate(resolve));
  expect(s.likeSaved).not.toHaveBeenCalled();
  const stranger = s.component(s.button('Skip').custom_id);
  stranger.click.user.id = 'bob';
  s.collector.emit('collect', stranger.click);
  expect(s.music.skip).not.toHaveBeenCalled();
});
it('auto-refreshes queue changes and closes/cleans timers without stopping playback', async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.queue.current!.track.title = 'Updated externally';
  await vi.advanceTimersByTimeAsync(10000);
  expect(s.text()).toContain('Updated externally');
  const close = s.component(s.button('Close').custom_id);
  s.collector.emit('collect', close.click);
  await vi.advanceTimersByTimeAsync(0);
  expect(s.controls().every((c) => c.disabled)).toBe(true);
  const count = s.editReply.mock.calls.length;
  await vi.advanceTimersByTimeAsync(20000);
  expect(s.editReply).toHaveBeenCalledTimes(count);
  expect(s.music.stop).not.toHaveBeenCalled();
});
it('expires controls and rejects a late modal submission without enqueuing', async () => {
  const s = await setup();
  const { click, submitted } = s.component(s.button('Add song').custom_id);
  click.awaitModalSubmit.mockImplementationOnce(async () => {
    s.collector.emit('end');
    return submitted;
  });
  s.collector.emit('collect', click);
  await new Promise((resolve) => setImmediate(resolve));
  expect(s.music.play).not.toHaveBeenCalled();
  expect(submitted.reply).toHaveBeenCalled();
  expect(s.controls().every((c) => c.disabled)).toBe(true);
});
it('handles modal timeout and serializes busy actions without double skip', async () => {
  const s = await setup();
  const { click } = s.component(s.button('Add song').custom_id);
  click.awaitModalSubmit.mockRejectedValueOnce({
    code: 'InteractionCollectorError',
  });
  s.collector.emit('collect', click);
  await new Promise((resolve) => setImmediate(resolve));
  expect(s.text()).toContain('timed out');
  let finish!: () => void;
  s.music.skip.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const first = s.component(s.button('Skip').custom_id);
  const second = s.component(s.button('Skip').custom_id);
  s.collector.emit('collect', first.click);
  s.collector.emit('collect', second.click);
  await new Promise((resolve) => setImmediate(resolve));
  expect(s.music.skip).toHaveBeenCalledOnce();
  expect(second.click.reply).toHaveBeenCalled();
  finish();
});
it('disables unavailable controls for an empty/disconnected session and handles failed persistence without leaks', async () => {
  const s = await setup(0);
  s.queue.current = undefined;
  s.queue.history = [];
  await s.click('Refresh');
  expect(s.button('Previous').disabled).toBe(true);
  expect(s.button('Skip').disabled).toBe(true);
  expect(s.button('Like song').disabled).toBe(true);
  expect(s.button('Add song').disabled).toBe(false);
  s.queue.current = {
    id: 'track',
    track: libraryTrack,
    enqueuedBy: 'alice',
    enqueuedAt: new Date(),
  };
  s.queue.generation++;
  await s.click('Refresh');
  s.likeSaved.mockRejectedValueOnce(new Error('private mongo details'));
  const { click } = await s.click('Like song');
  expect(JSON.stringify(click.followUp.mock.calls)).not.toContain(
    'private mongo',
  );
  expect(s.button('Like song').disabled).toBe(false);
});

it('bounds hostile metadata within component text limits and omits signed media links', async () => {
  const s = await setup(20);
  for (const entry of [s.queue.current!, ...s.queue.upcoming]) {
    entry.track.title = '*'.repeat(500);
    entry.track.artists = Array.from({ length: 30 }, () => ({
      name: '*'.repeat(500),
    }));
    entry.track.canonicalUrl = 'https://private.invalid/?token=secret';
    entry.track.album = { title: '*'.repeat(500) };
  }
  await s.click('Refresh');
  const contents: string[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.content === 'string') contents.push(o.content);
    if (Array.isArray(o.components)) o.components.forEach(walk);
  };
  walk(JSON.parse(s.text()));
  expect(contents.every((content) => content.length <= 4000)).toBe(true);
  expect(contents.join('').length).toBeLessThanOrEqual(4000);
  expect(s.text()).not.toContain('token=secret');
});
it('rejects adding after the owner leaves voice during the modal and closes on automatic refresh failure', async () => {
  vi.useFakeTimers();
  const s = await setup();
  const { click, submitted } = s.component(s.button('Add song').custom_id);
  click.awaitModalSubmit.mockImplementationOnce(async () => {
    s.guild.voiceStates.cache.delete('alice');
    return submitted;
  });
  s.collector.emit('collect', click);
  await vi.advanceTimersByTimeAsync(0);
  expect(s.music.play).not.toHaveBeenCalled();
  expect(submitted.followUp).toHaveBeenCalled();
  s.editReply.mockRejectedValueOnce(new Error('unknown interaction'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(s.collector.stop).toHaveBeenCalledWith('refresh-error');
  expect(s.controls().every((c) => c.disabled)).toBe(true);
  const count = s.editReply.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(s.editReply).toHaveBeenCalledTimes(count);
});

it('keeps Close available while an add modal is pending and blocks its late submission', async () => {
  const s = await setup();
  const { click, submitted } = s.component(s.button('Add song').custom_id);
  let submit!: (value: typeof submitted) => void;
  click.awaitModalSubmit.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        submit = resolve;
      }),
  );
  s.collector.emit('collect', click);
  await new Promise((resolve) => setImmediate(resolve));
  expect(s.button('Close').disabled).toBe(false);
  const close = s.component(s.button('Close').custom_id);
  s.collector.emit('collect', close.click);
  submit(submitted);
  await new Promise((resolve) => setImmediate(resolve));
  expect(s.music.play).not.toHaveBeenCalled();
  expect(s.controls().every((control) => control.disabled)).toBe(true);
});

it('shuffles upcoming tracks from the player through MusicService and rechecks voice', async () => {
  const s = await setup(3);
  const current = structuredClone(s.queue.current);
  expect(s.button('Shuffle').disabled).toBe(false);
  await s.click('Shuffle');
  expect(s.music.shuffle).toHaveBeenCalledWith('guild');
  expect(s.queue.current).toEqual(current);
  expect(s.queue.upcoming.map((e) => e.track.title)).toEqual([
    'Song 4',
    'Song 3',
    'Song 2',
  ]);
  s.music.shuffle.mockClear();
  s.guild.voiceStates.cache.set('alice', { channelId: 'other' });
  await s.click('Shuffle');
  expect(s.music.shuffle).not.toHaveBeenCalled();
  expect(s.context.reportComponentError).toHaveBeenCalled();
});
it('disables player shuffle when fewer than two upcoming songs exist', async () => {
  const s = await setup(1);
  expect(s.button('Shuffle').disabled).toBe(true);
});
