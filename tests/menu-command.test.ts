import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { MongoLibraryRepository, saveTrack } from '@kairo/data';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';
import { LibraryService } from '../apps/bot/src/services/LibraryService.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';
import { libraryModel, libraryTrack } from './helpers/libraryModel.js';

async function setup() {
  const { connection } = libraryModel();
  const repository = new MongoLibraryRepository(connection);
  const music = {
    info: vi.fn(async () => libraryTrack),
    currentTrack: vi.fn(() => libraryTrack),
    playTracks: vi.fn(async () => ({ queued: 1 })),
    assertVoiceChannel: vi.fn(),
  };
  const service = new LibraryService(
    repository,
    music as unknown as MusicService,
  );
  await repository.create('alice', 'Mix', [saveTrack(libraryTrack)]);
  await service.like('alice', 'guild');
  const reportError = vi.fn();
  const handler = createSlashCommandHandler({
    music: music as unknown as MusicService,
    library: service,
    settings: {} as never,
    audit: new AuditLog(),
    developerIds: new Set(),
    reportError,
  });
  const collector = Object.assign(new EventEmitter(), {
    stop: vi.fn((reason: string) => collector.emit('end', [], reason)),
  });
  const createCollector = vi.fn((options: unknown) => {
    void options;
    return collector;
  });
  let payload: unknown;
  const editReply = vi.fn(async (options: unknown) => {
    payload = options;
    return { createMessageComponentCollector: createCollector };
  });
  const guild = {
    voiceAdapterCreator: vi.fn(),
    voiceStates: { cache: new Map([['alice', { channelId: 'voice' }]]) },
  };
  const interaction = {
    id: 'menu-id',
    commandName: 'menu',
    user: { id: 'alice' },
    guildId: 'guild',
    guild,
    deferred: false,
    replied: false,
    deferReply: vi.fn(async () => {
      interaction.deferred = true;
    }),
    editReply,
    reply: vi.fn(),
    followUp: vi.fn(),
  };
  await handler.execute(interaction as unknown as ChatInputCommandInteraction);
  const json = () =>
    JSON.parse(JSON.stringify(payload)) as {
      flags: number;
      components: unknown[];
    };
  const text = () => JSON.stringify(json());
  const controls = (): {
    custom_id: string;
    label?: string;
    options?: { label: string; value: string }[];
    disabled?: boolean;
  }[] => {
    const found: ReturnType<typeof controls> = [];
    const walk = (v: unknown) => {
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      if (o.custom_id) found.push(o as never);
      if (Array.isArray(o.components)) o.components.forEach(walk);
    };
    json().components.forEach(walk);
    return found;
  };
  const button = (label: string) =>
    controls().find((c) => c.label === label)!.custom_id;
  async function click(
    id: string,
    values?: string[],
    modalFields?: Record<string, string>,
    user = 'alice',
    control: { modalError?: unknown; beforeSubmit?: () => void } = {},
  ) {
    const submitted = {
      customId: '',
      user: { id: user },
      fields: { getTextInputValue: (key: string) => modalFields?.[key] ?? '' },
      deferUpdate: vi.fn(),
      reply: vi.fn(async () => {}),
      followUp: vi.fn(async () => {}),
    };
    const component = {
      id: 'click',
      customId: id,
      user: { id: user },
      guildId: 'guild',
      guild,
      values: values ?? [],
      isButton: () => !values,
      isStringSelectMenu: () => Boolean(values),
      update: vi.fn(async (options: unknown) => {
        payload = options;
      }),
      deferUpdate: vi.fn(async () => {
        component.deferred = true;
      }),
      deferred: false,
      replied: false,
      reply: vi.fn(async () => {}),
      followUp: vi.fn(async () => {}),
      showModal: vi.fn(async (modal: { toJSON(): { custom_id: string } }) => {
        component.replied = true;
        submitted.customId = modal.toJSON().custom_id;
      }),
      awaitModalSubmit: vi.fn(
        async (options: { time: number; filter: (i: unknown) => boolean }) => {
          expect(options.time).toBeLessThanOrEqual(60000);
          if (control.modalError) throw control.modalError;
          control.beforeSubmit?.();
          expect(options.filter(submitted)).toBe(true);
          expect(options.filter({ ...submitted, user: { id: 'bob' } })).toBe(
            false,
          );
          return submitted;
        },
      ),
    };
    collector.emit('collect', component);
    await vi.waitFor(() =>
      expect(
        component.update.mock.calls.length +
          component.deferUpdate.mock.calls.length +
          component.showModal.mock.calls.length +
          component.reply.mock.calls.length,
      ).toBeGreaterThan(0),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { component, submitted };
  }
  return {
    service,
    repository,
    music,
    handler,
    interaction,
    collector,
    createCollector,
    json,
    text,
    controls,
    button,
    click,
    reportError,
  };
}

it('registers an ephemeral menu, scopes owners, browses collections, and expires controls', async () => {
  const s = await setup();
  expect(s.handler.names()).toContain('menu');
  expect(s.interaction.deferReply).toHaveBeenCalledWith({
    flags: MessageFlags.Ephemeral,
  });
  expect(s.json().flags).toBe(MessageFlags.IsComponentsV2);
  expect(s.text()).toContain('Your library');
  const config = s.createCollector.mock.calls[0]![0] as {
    time: number;
    filter: (i: unknown) => boolean;
  };
  expect(config.time).toBe(300000);
  expect(
    config.filter({ customId: s.button('Liked Songs'), user: { id: 'bob' } }),
  ).toBe(false);
  await s.click(s.button('Liked Songs'));
  await vi.waitFor(() => expect(s.text()).toContain('Song'));
  await s.click(s.button('Playlists'));
  await vi.waitFor(() => expect(s.text()).toContain('Mix'));
  const select = s
    .controls()
    .find((c) => c.options?.some((o) => o.label === 'Mix'))!;
  await s.click(select.custom_id, [select.options![0]!.value]);
  await vi.waitFor(() => expect(s.text()).toContain('Add song'));
  s.collector.emit('end', [], 'time');
  await vi.waitFor(() =>
    expect(s.controls().every((c) => c.disabled)).toBe(true),
  );
  expect(s.text()).toContain('expired');
});
it('adds/unadds selected liked tracks, plays via the existing service, and saves a persistent copy', async () => {
  const s = await setup();
  await s.click(s.button('Liked Songs'));
  await vi.waitFor(() => expect(s.text()).toContain('Add song'));
  const tracks = s
    .controls()
    .find((c) => c.options?.some((o) => o.label.includes('Song')))!;
  await s.click(tracks.custom_id, [tracks.options![0]!.value]);
  await vi.waitFor(() => expect(s.text()).toContain('Unlike'));
  await s.click(s.button('Play collection'));
  await vi.waitFor(() => expect(s.music.playTracks).toHaveBeenCalledOnce());
  await s.click(s.button('Save as playlist'), undefined, {
    name: 'Saved favorites',
  });
  await vi.waitFor(async () =>
    expect(
      (await s.repository.get('alice', 'Saved favorites')).entries,
    ).toHaveLength(1),
  );
  await s.click(s.button('Unlike'));
  await vi.waitFor(async () =>
    expect((await s.service.liked('alice')).entries).toEqual([]),
  );
  await s.click(s.button('Add song'), undefined, { query: 'Song query' });
  await vi.waitFor(() =>
    expect(s.music.info).toHaveBeenCalledWith('Song query', 'guild', 'alice'),
  );
  await vi.waitFor(async () =>
    expect((await s.service.liked('alice')).entries).toHaveLength(1),
  );
});
it('creates playlists with modals, adds queries, and removes entries safely after reordering', async () => {
  const s = await setup();
  await s.click(s.button('Create playlist'), undefined, { name: 'New mix' });
  await vi.waitFor(() => expect(s.text()).toContain('New mix'));
  await s.click(s.button('Add song'), undefined, { query: 'Song' });
  await vi.waitFor(async () =>
    expect((await s.service.get('alice', 'New mix')).entries).toHaveLength(1),
  );
  const tracks = s
    .controls()
    .find((c) => c.options?.some((o) => o.label.includes('Song')))!;
  await s.click(tracks.custom_id, [tracks.options![0]!.value]);
  await vi.waitFor(() => expect(s.text()).toContain('Remove from playlist'));
  await s.repository.append('alice', 'New mix', [
    saveTrack({ ...libraryTrack, sourceId: 'bcdefghijkl', title: 'Second' }),
  ]);
  await s.repository.move('alice', 'New mix', 2, 1);
  await s.click(s.button('Remove from playlist'));
  await vi.waitFor(async () =>
    expect(
      (await s.service.get('alice', 'New mix')).entries.map(
        (e) => e.track.title,
      ),
    ).toEqual(['Second']),
  );
});

it('paginates large collections and rejects foreign or forged track selections', async () => {
  const s = await setup();
  for (let i = 0; i < 20; i++)
    await s.repository.like(
      'alice',
      saveTrack({
        ...libraryTrack,
        sourceProvider: 'fixture',
        sourceId: `song-${i}`,
        title: `Track ${i}`,
      }),
    );
  await s.click(s.button('Liked Songs'));
  await vi.waitFor(() => expect(s.text()).toContain('Page 1/3'));
  await s.click(s.button('Next'));
  await vi.waitFor(() => expect(s.text()).toContain('Page 2/3'));
  const config = s.createCollector.mock.calls[0]![0] as {
    filter: (i: unknown) => boolean;
  };
  expect(
    config.filter({
      customId: 'kairo:menu:other:liked',
      user: { id: 'alice' },
    }),
  ).toBe(false);
  expect(
    config.filter({
      customId: 'kairo:menu:menu-id:unknown',
      user: { id: 'alice' },
    }),
  ).toBe(false);
  const trackMenu = s
    .controls()
    .find((c) => c.options?.some((o) => o.label.startsWith('Track')))!;
  const selected = await s.click(trackMenu.custom_id, ['not-an-owned-entry']);
  await vi.waitFor(() =>
    expect(selected.component.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Choose a track from this page.' }),
    ),
  );
  expect(s.reportError).toHaveBeenCalled();
  expect((await s.service.liked('alice')).entries).toHaveLength(21);
});
it('times out cancelled modals and ignores submissions after menu expiry', async () => {
  const s = await setup();
  await s.click(s.button('Liked Songs'));
  await vi.waitFor(() => expect(s.text()).toContain('Add song'));
  await s.click(s.button('Add song'), undefined, {}, 'alice', {
    modalError: Object.assign(new Error('timeout'), {
      code: 'InteractionCollectorError',
    }),
  });
  await vi.waitFor(() => expect(s.text()).toContain('No changes were made'));
  expect(s.music.info).not.toHaveBeenCalled();
  const late = await s.click(
    s.button('Add song'),
    undefined,
    { query: 'Late song' },
    'alice',
    { beforeSubmit: () => s.collector.emit('end', [], 'time') },
  );
  await vi.waitFor(() =>
    expect(late.submitted.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'This menu has expired. Run /menu again.',
      }),
    ),
  );
  expect(s.music.info).not.toHaveBeenCalled();
  expect(s.controls().every((c) => c.disabled)).toBe(true);
});
it('rejects overlapping actions and reports provider failures safely without corrupting the library', async () => {
  const s = await setup();
  await s.click(s.button('Liked Songs'));
  await vi.waitFor(() => expect(s.text()).toContain('Add song'));
  let fail!: (error: Error) => void;
  s.music.info.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const add = await s.click(s.button('Add song'), undefined, {
    query: 'Bad song',
  });
  await vi.waitFor(() => expect(s.music.info).toHaveBeenCalled());
  const overlapping = await s.click(s.button('Play collection'));
  expect(overlapping.component.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('in progress'),
    }),
  );
  expect(s.music.playTracks).not.toHaveBeenCalled();
  fail(new Error('token=secret private payload'));
  await vi.waitFor(() =>
    expect(add.submitted.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'The command could not be completed.',
      }),
    ),
  );
  expect(s.reportError).toHaveBeenCalled();
  expect((await s.service.liked('alice')).entries).toHaveLength(1);
});
it('saves selected liked tracks to an existing playlist and checks voice before playback', async () => {
  const s = await setup();
  await s.click(s.button('Liked Songs'));
  await vi.waitFor(() => expect(s.text()).toContain('Add song'));
  const menu = s
    .controls()
    .find((c) => c.options?.some((o) => o.label === 'Song'))!;
  await s.click(menu.custom_id, [menu.options![0]!.value]);
  await vi.waitFor(() => expect(s.text()).toContain('Save track to playlist'));
  await s.click(s.button('Save track to playlist'), undefined, { name: 'Mix' });
  await vi.waitFor(() => expect(s.text()).toContain('already in the playlist'));
  expect((await s.service.get('alice', 'Mix')).entries).toHaveLength(1);
  s.interaction.guild.voiceStates.cache.clear();
  const played = await s.click(s.button('Play collection'));
  await vi.waitFor(() =>
    expect(played.component.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Join a voice channel first.' }),
    ),
  );
  expect(s.music.playTracks).not.toHaveBeenCalled();
});

it('deletes a playlist only after confirmation, preserves cancelled/stale data, and allows closing', async () => {
  const s = await setup();
  await s.click(s.button('Playlists'));
  await vi.waitFor(() => expect(s.text()).toContain('Mix'));
  const menu = s
    .controls()
    .find((c) => c.options?.some((o) => o.label === 'Mix'))!;
  await s.click(menu.custom_id, [menu.options![0]!.value]);
  await vi.waitFor(() => expect(s.text()).toContain('Delete playlist'));
  await s.click(s.button('Delete playlist'));
  await vi.waitFor(() => expect(s.text()).toContain('Confirm delete'));
  await s.click(s.button('Cancel'));
  await vi.waitFor(() => expect(s.text()).toContain('Add song'));
  expect(await s.service.get('alice', 'Mix')).toBeDefined();
  await s.click(s.button('Delete playlist'));
  await vi.waitFor(() => expect(s.text()).toContain('Confirm delete'));
  await s.repository.append('alice', 'Mix', [
    saveTrack({ ...libraryTrack, sourceId: 'bcdefghijkl' }),
  ]);
  const stale = await s.click(s.button('Confirm delete'));
  await vi.waitFor(() =>
    expect(stale.component.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('changed') }),
    ),
  );
  expect((await s.service.get('alice', 'Mix')).entries).toHaveLength(2);
  await s.click(s.button('Cancel'));
  await vi.waitFor(() => expect(s.text()).toContain('Add song'));
  await s.click(s.button('Delete playlist'));
  await vi.waitFor(() => expect(s.text()).toContain('Confirm delete'));
  await s.click(s.button('Confirm delete'));
  await vi.waitFor(() => expect(s.text()).toContain('Deleted playlist'));
  await expect(s.service.get('alice', 'Mix')).rejects.toMatchObject({
    code: 'PLAYLIST_NOT_FOUND',
  });
  await s.click(s.button('Close'));
  expect(s.collector.stop).toHaveBeenCalledWith('closed');
  expect(s.controls().every((c) => c.disabled)).toBe(true);
});
