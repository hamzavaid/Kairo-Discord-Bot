import { expect, it, vi } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import info from '../apps/bot/src/commands/utility/info.js';
import type { CommandExecutionContext } from '../apps/bot/src/commands/types.js';
import { libraryTrack } from './helpers/libraryModel.js';

it('renders metadata in Components V2 with canonical hyperlinks, artwork, and no playback', async () => {
  const music = {
    info: vi.fn(async () => ({
      ...libraryTrack,
      canonicalUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      artworkUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
      album: { title: 'Album' },
      provenance: {
        input: 'secret input',
        parsedBy: 'youtube-sr',
        confidence: 0.91,
      },
    })),
    play: vi.fn(),
    enqueue: vi.fn(),
  };
  const editReply = vi.fn(async (options: unknown) => {
    void options;
  });
  await info.execute(
    {
      options: { getString: () => 'query', getInteger: () => null },
      guildId: 'guild',
      user: { id: 'user' },
      deferReply: vi.fn(),
      editReply,
    } as unknown as ChatInputCommandInteraction,
    { music } as unknown as CommandExecutionContext,
  );
  const payload = editReply.mock.calls[0]![0] as {
    flags: number;
    components: { toJSON(): unknown }[];
    content?: string;
    embeds?: unknown;
  };
  expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
  expect(payload.content).toBeUndefined();
  expect(payload.embeds).toBeUndefined();
  const json = JSON.stringify(payload.components.map((c) => c.toJSON()));
  expect(json).toContain(
    '[Song](<https://www.youtube.com/watch?v=abcdefghijk>)',
  );
  expect(json).toContain('hqdefault.jpg');
  expect(json).toContain('3:00');
  expect(json).toContain('0.91');
  expect(json).toContain('Album');
  expect(json).not.toContain('secret input');
  expect(music.play).not.toHaveBeenCalled();
  expect(music.enqueue).not.toHaveBeenCalled();
});
it('bounds hostile metadata text and omits unsafe URLs and missing artwork', async () => {
  const editReply = vi.fn(async (options: unknown) => {
    void options;
  });
  await info.execute(
    {
      options: { getString: () => 'query', getInteger: () => null },
      guildId: 'guild',
      user: { id: 'user' },
      deferReply: vi.fn(),
      editReply,
    } as unknown as ChatInputCommandInteraction,
    {
      music: {
        info: async () => ({
          ...libraryTrack,
          title: '@everyone [bad] '.repeat(500),
          sourceProvider: 'unknown',
          sourceId: undefined,
          canonicalUrl: 'https://private.invalid/?token=secret',
          artworkUrl: 'file:///secret',
        }),
      },
    } as unknown as CommandExecutionContext,
  );
  const payload = editReply.mock.calls[0]![0] as {
    components: { toJSON(): unknown }[];
    allowedMentions: unknown;
  };
  expect(payload.allowedMentions).toEqual({ parse: [] });
  const json = JSON.stringify(payload.components.map((c) => c.toJSON()));
  expect(json).not.toContain('token=secret');
  expect(json).not.toContain('file:');
  expect(json.length).toBeLessThan(4000);
});

it('includes a large YouTube picture even when metadata artwork is absent or has query parameters', async () => {
  const { infoCard } =
    await import('../apps/bot/src/commands/utility/formatTrack.js');
  for (const artworkUrl of [
    undefined,
    'https://i.ytimg.com/vi/abcdefghijk/hq720.jpg?sqp=resize&rs=cache',
  ]) {
    const json = infoCard({
      ...libraryTrack,
      ...(artworkUrl ? { artworkUrl } : {}),
    }).toJSON();
    const gallery = json.components.find((c) => c.type === 12);
    expect(gallery).toMatchObject({
      type: 12,
      items: [
        { media: { url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' } },
      ],
    });
  }
});
it('registers bounded searchs and browses only the owner requested metadata results', async () => {
  const { EventEmitter } = await import('node:events');
  const collector = new EventEmitter();
  const createCollector = vi.fn((options: unknown) => {
    void options;
    return collector;
  });
  const editReply = vi.fn(async (options: unknown) => {
    void options;
    return { createMessageComponentCollector: createCollector };
  });
  const results = [
    libraryTrack,
    { ...libraryTrack, title: 'Second', sourceId: 'bcdefghijkl' },
  ];
  const music = { infoResults: vi.fn(async () => results), play: vi.fn() };
  const context = {
    music,
    reportComponentError: vi.fn(),
  } as unknown as CommandExecutionContext;
  await info.execute(
    {
      id: 'search-id',
      options: { getString: () => 'song', getInteger: () => 2 },
      guildId: 'guild',
      user: { id: 'alice' },
      deferReply: vi.fn(),
      editReply,
    } as unknown as ChatInputCommandInteraction,
    context,
  );
  expect(info.data.toJSON().options?.[1]).toMatchObject({
    name: 'searchs',
    type: 4,
    min_value: 1,
    max_value: 25,
    required: false,
  });
  expect(music.infoResults).toHaveBeenCalledWith('song', 'guild', 'alice', 2);
  const options = createCollector.mock.calls[0]![0] as {
    time: number;
    filter: (i: unknown) => boolean;
  };
  expect(options.time).toBe(60000);
  expect(
    options.filter({
      user: { id: 'bob' },
      customId: 'kairo:info:search-id:next',
    }),
  ).toBe(false);
  const update = vi.fn(async (options: unknown) => {
    void options;
  });
  collector.emit('collect', {
    user: { id: 'alice' },
    customId: 'kairo:info:search-id:next',
    isButton: () => true,
    update,
  });
  await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
  expect(JSON.stringify(update.mock.calls[0]![0])).toContain('Second');
  expect(JSON.stringify(update.mock.calls[0]![0])).toContain('Result 2/2');
  collector.emit('end');
  await vi.waitFor(() =>
    expect(JSON.stringify(editReply.mock.calls.at(-1)![0])).toContain(
      '"disabled":true',
    ),
  );
  expect(music.play).not.toHaveBeenCalled();
});

it('lets only the owner like the displayed result, handles duplicates, and disables expired controls', async () => {
  const { EventEmitter } = await import('node:events');
  const collector = new EventEmitter();
  const createCollector = vi.fn((options: unknown) => {
    void options;
    return collector;
  });
  const editReply = vi.fn(async (_options: unknown) => {
    void _options;
    return { createMessageComponentCollector: createCollector };
  });
  const likeSaved = vi.fn(async () => ({ added: false }));
  const tracks = [
    libraryTrack,
    { ...libraryTrack, title: 'Second', sourceId: 'bcdefghijkl' },
  ];
  const context = {
    music: {
      infoResults: vi.fn(async () => tracks),
      info: vi.fn(),
      play: vi.fn(),
    },
    library: { likeSaved },
    reportComponentError: vi.fn(),
  } as unknown as CommandExecutionContext;
  await info.execute(
    {
      id: 'like-test',
      options: { getString: () => 'song', getInteger: () => 2 },
      guildId: 'guild',
      user: { id: 'alice' },
      deferReply: vi.fn(),
      editReply,
    } as unknown as ChatInputCommandInteraction,
    context,
  );
  const options = createCollector.mock.calls[0]![0] as {
    filter(i: unknown): boolean;
  };
  const update = vi.fn();
  collector.emit('collect', {
    customId: 'kairo:info:like-test:next',
    user: { id: 'alice' },
    isButton: () => true,
    update,
  });
  await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
  const click = {
    customId: 'kairo:info:like-test:like:1',
    user: { id: 'alice' },
    isButton: () => true,
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
  };
  expect(options.filter({ ...click, user: { id: 'bob' } })).toBe(false);
  collector.emit('collect', { ...click, user: { id: 'bob' } });
  expect(likeSaved).not.toHaveBeenCalled();
  collector.emit('collect', click);
  await vi.waitFor(() => expect(click.followUp).toHaveBeenCalled());
  expect(likeSaved).toHaveBeenCalledWith('alice', tracks[1]);
  expect(click.deferUpdate).toHaveBeenCalledOnce();
  expect(JSON.stringify(click.followUp.mock.calls[0])).toContain('already');
  expect(JSON.stringify(click.editReply.mock.calls[0])).toContain('Liked');
  expect(context.music.info).not.toHaveBeenCalled();
  expect(context.music.play).not.toHaveBeenCalled();
  collector.emit('collect', click);
  await vi.waitFor(() => expect(click.deferUpdate).toHaveBeenCalledTimes(2));
  expect(likeSaved).toHaveBeenCalledTimes(1);
  collector.emit('end');
  await vi.waitFor(() => expect(editReply).toHaveBeenCalledTimes(2));
  expect(options.filter(click)).toBe(false);
  const json = JSON.stringify(editReply.mock.calls.at(-1)![0]);
  expect(json).toContain('"disabled":true');
});
it('supports liking a single info result and reports persistence errors safely', async () => {
  const { EventEmitter } = await import('node:events');
  const collector = new EventEmitter();
  const failure = new Error('private database detail');
  const reportComponentError = vi.fn();
  const likeSaved = vi
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({ added: true });
  const editReply = vi.fn(async () => ({
    createMessageComponentCollector: () => collector,
  }));
  await info.execute(
    {
      id: 'single',
      options: { getString: () => 'song', getInteger: () => null },
      guildId: 'guild',
      user: { id: 'alice' },
      deferReply: vi.fn(),
      editReply,
    } as unknown as ChatInputCommandInteraction,
    {
      music: { info: async () => libraryTrack },
      library: { likeSaved },
      reportComponentError,
      componentErrorMessage: () => 'Could not save the song.',
    } as unknown as CommandExecutionContext,
  );
  const click = {
    customId: 'kairo:info:single:like:0',
    user: { id: 'alice' },
    isButton: () => true,
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
  };
  collector.emit('collect', click);
  await vi.waitFor(() =>
    expect(reportComponentError).toHaveBeenCalledWith(failure),
  );
  expect(JSON.stringify(click.followUp.mock.calls)).not.toContain(
    'private database detail',
  );
  collector.emit('collect', click);
  await vi.waitFor(() => expect(click.editReply).toHaveBeenCalled());
  expect(likeSaved).toHaveBeenCalledWith('alice', libraryTrack);
  expect(JSON.stringify(click.followUp.mock.calls)).toContain('Liked');
});
