import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MongoLibraryRepository, saveTrack } from '@kairo/data';
import { MusicError } from '@kairo/music-engine';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { LibraryService } from '../apps/bot/src/services/LibraryService.js';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';
import { libraryModel, libraryTrack } from './helpers/libraryModel.js';

function setup() {
  const { connection } = libraryModel();
  const repository = new MongoLibraryRepository(connection);
  const music = {
    info: vi.fn(async () => libraryTrack),
    currentTrack: vi.fn(() => libraryTrack),
    collection: vi.fn(async () => ({
      id: 'collection',
      title: 'Collection',
      sourceProvider: 'youtube-sr',
      tracks: [libraryTrack],
      importSummary: {
        total: 2,
        imported: 1,
        skipped: 1,
        failed: 0,
        truncated: false,
        partial: false,
      },
    })),
    playTracks: vi.fn(async () => ({ queued: 1 })),
    assertVoiceChannel: vi.fn(),
  };
  const audit = new AuditLog();
  const reportError = vi.fn();
  const handler = createSlashCommandHandler({
    music: music as unknown as MusicService,
    library: new LibraryService(repository, music as unknown as MusicService),
    audit,
    settings: {} as never,
    developerIds: new Set(),
    reportError,
  });
  async function run(
    name: string,
    subcommand: string,
    options: Record<string, string | number> = {},
    owner = 'alice',
  ) {
    const collector = Object.assign(new EventEmitter(), {
      stop: vi.fn((reason: string) => collector.emit('end', [], reason)),
    });
    const createCollector = vi.fn((options: unknown) => {
      void options;
      return collector;
    });
    const editReply = vi.fn(
      async (options: unknown) => (
        void options,
        {
          createMessageComponentCollector: createCollector,
        }
      ),
    );
    const reply = vi.fn(
      async (options: unknown) => (
        void options,
        {
          resource: {
            message: { createMessageComponentCollector: createCollector },
          },
        }
      ),
    );
    const interaction = {
      id: 'interaction',
      commandName: name,
      user: { id: owner },
      guildId: 'guild',
      guild: {
        voiceAdapterCreator: vi.fn(),
        voiceStates: { cache: new Map([[owner, { channelId: 'voice' }]]) },
      },
      deferred: false,
      replied: false,
      options: {
        getSubcommand: () => subcommand,
        getString: (key: string) => options[key] ?? null,
        getInteger: (key: string) => options[key] ?? null,
      },
      deferReply: vi.fn(async () => {
        interaction.deferred = true;
      }),
      editReply,
      reply,
      followUp: vi.fn(async () => {}),
    };
    await handler.execute(
      interaction as unknown as ChatInputCommandInteraction,
    );
    const data = () =>
      editReply.mock.calls.at(-1)?.[0] as unknown as {
        content: string;
        components?: {
          toJSON(): { components: { custom_id: string; disabled?: boolean }[] };
        }[];
      };
    return { interaction, editReply, reply, collector, createCollector, data };
  }
  return { repository, music, handler, run, audit, reportError };
}
function click(customId: string, owner = 'alice') {
  return {
    customId,
    user: { id: owner },
    isButton: () => true,
    update: vi.fn(async (options: unknown) => {
      void options;
    }),
    followUp: vi.fn(async () => {}),
  };
}

describe('Phase 7 slash commands and scoped controls', () => {
  it('registers required playlist/liked subcommands in the current handler and includes Library help', async () => {
    const { handler, run } = setup();
    const playlist = handler
      .registrationData()
      .find((c) => c.name === 'playlist');
    expect(playlist?.options?.map((o) => o.name)).toEqual(
      expect.arrayContaining([
        'create',
        'delete',
        'list',
        'show',
        'add',
        'remove',
        'play',
        'import',
        'edit',
        'info',
      ]),
    );
    expect(
      handler
        .registrationData()
        .find((c) => c.name === 'liked')
        ?.options?.map((o) => o.name),
    ).toEqual(['list', 'play', 'clear']);
    expect(handler.names()).toEqual(
      expect.arrayContaining(['like', 'dislike', 'liked', 'playlist']),
    );
    const help = await run('help', '');
    expect(JSON.stringify(help.reply.mock.calls[0]?.[0])).toContain('Library');
    expect(JSON.stringify(help.reply.mock.calls[0]?.[0])).not.toContain(
      'Developer',
    );
  });
  it('creates/adds/shows/removes/imports/plays through services and reports unsupported imports safely', async () => {
    const { run, repository, music, audit } = setup();
    await run('playlist', 'create', { name: 'Mix' });
    await run('playlist', 'add', { name: 'Mix', query: 'song' });
    expect(music.info).toHaveBeenCalledWith('song', 'guild', 'alice');
    expect(
      (await run('playlist', 'show', { name: 'Mix' })).data().content,
    ).toContain('1.');
    await run('playlist', 'play', { name: 'Mix' });
    expect(music.playTracks).toHaveBeenCalledOnce();
    await run('playlist', 'remove', { name: 'Mix', position: 1 });
    expect((await repository.get('alice', 'Mix')).entries).toHaveLength(0);
    const imported = await run('playlist', 'import', {
      name: 'Imported',
      url: 'https://www.youtube.com/playlist?list=PLabcdefghijk',
    });
    expect(imported.data().content).toContain('1 imported');
    music.collection.mockRejectedValueOnce(
      new MusicError('COLLECTION_UNSUPPORTED', 'raw payload'),
    );
    const failed = await run('playlist', 'import', {
      name: 'Bad',
      url: 'https://untrusted.invalid',
    });
    expect(failed.data().content).not.toContain('raw payload');
    expect(audit.list(1, 1)[0]?.success).toBe(false);
    await expect(repository.get('alice', 'Bad')).rejects.toMatchObject({
      code: 'PLAYLIST_NOT_FOUND',
    });
  });
  it('paginates ordered tracks, prevents non-owner controls, and disables expired buttons', async () => {
    const { repository, run } = setup();
    await repository.create('alice', 'Mix');
    await repository.append(
      'alice',
      'Mix',
      Array.from({ length: 21 }, (_, i) =>
        saveTrack({
          ...libraryTrack,
          sourceProvider: 'fixture',
          sourceId: `song-${i}`,
          title: `Song ${i}`,
        }),
      ),
    );
    const built = await run('playlist', 'show', { name: 'Mix', page: 2 });
    expect(built.data().content).toContain('11.');
    expect(built.data().content).toContain('Page 2/3');
    const config = built.createCollector.mock.calls[0]?.[0] as unknown as {
      time: number;
      filter: (i: ReturnType<typeof click>) => boolean;
    };
    const id = built.data().components![0]!.toJSON().components[1]!.custom_id;
    expect(config.time).toBe(60000);
    expect(config.filter(click(id, 'bob'))).toBe(false);
    const next = click(id);
    built.collector.emit('collect', next);
    await vi.waitFor(() => expect(next.update).toHaveBeenCalledOnce());
    expect(JSON.stringify(next.update.mock.calls[0])).toContain('Page 3/3');
    built.collector.emit('end', [], 'time');
    await vi.waitFor(() =>
      expect(
        built
          .data()
          .components![0]!.toJSON()
          .components.every((b) => b.disabled),
      ).toBe(true),
    );
    const invalid = await run('playlist', 'show', { name: 'Mix', page: 9 });
    expect(invalid.data().content).toContain('page');
  });
  it('deletes only after owner confirmation and cancels/expiries do not delete', async () => {
    const { repository, run } = setup();
    await repository.create('alice', 'Mix');
    const built = await run('playlist', 'delete', { name: 'Mix' });
    expect(await repository.get('alice', 'Mix')).toBeDefined();
    const id = built.data().components![0]!.toJSON().components[0]!.custom_id;
    built.collector.emit('collect', click(id, 'bob'));
    expect(await repository.get('alice', 'Mix')).toBeDefined();
    built.collector.emit('collect', click(id));
    await vi.waitFor(() => expect(built.data().content).toContain('Deleted'));
    await expect(repository.get('alice', 'Mix')).rejects.toMatchObject({
      code: 'PLAYLIST_NOT_FOUND',
    });
    await repository.create('alice', 'Other');
    const expired = await run('playlist', 'delete', { name: 'Other' });
    expired.collector.emit('end', [], 'time');
    await vi.waitFor(() => expect(expired.data().content).toContain('expired'));
    expect(await repository.get('alice', 'Other')).toBeDefined();
  });
  it('likes/unlikes current or queries, lists/plays liked, and clears only after confirmation', async () => {
    const { run, repository, music } = setup();
    expect((await run('like', '')).data().content).toContain('Liked');
    expect((await run('like', '', { query: 'song' })).data().content).toContain(
      'already',
    );
    expect((await run('liked', 'list')).data().content).toContain('Song');
    await run('liked', 'play');
    expect(music.playTracks).toHaveBeenCalledOnce();
    expect((await run('dislike', '')).data().content).toContain('Removed');
    expect(
      (await run('dislike', '', { query: 'song' })).data().content,
    ).toContain('not');
    await run('like', '');
    const clear = await run('liked', 'clear');
    expect((await repository.liked('alice')).entries).toHaveLength(1);
    clear.collector.emit(
      'collect',
      click(clear.data().components![0]!.toJSON().components[0]!.custom_id),
    );
    await vi.waitFor(() => expect(clear.data().content).toContain('Cleared'));
    expect((await repository.liked('alice')).entries).toEqual([]);
    expect((await run('liked', 'play')).data().content).toContain('empty');
  });
});

it('paginates playlist lists and liked tracks, handles cancellation, and reports stale confirmation safely', async () => {
  const { repository, run, reportError, audit } = setup();
  for (let i = 0; i < 11; i++) await repository.create('alice', `Mix ${i}`);
  expect((await run('playlist', 'list', { page: 2 })).data().content).toContain(
    'Page 2/2',
  );
  for (let i = 0; i < 11; i++)
    await repository.like(
      'alice',
      saveTrack({
        ...libraryTrack,
        sourceProvider: 'fixture',
        sourceId: `song-${i}`,
      }),
    );
  expect((await run('liked', 'list', { page: 2 })).data().content).toContain(
    '11.',
  );
  const cancelled = await run('liked', 'clear');
  const cancel = click(
    cancelled.data().components![0]!.toJSON().components[1]!.custom_id,
  );
  cancelled.collector.emit('collect', cancel);
  await vi.waitFor(() =>
    expect(cancel.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Cancelled.' }),
    ),
  );
  expect((await repository.liked('alice')).entries).toHaveLength(11);
  const stale = await run('liked', 'clear');
  await repository.like(
    'alice',
    saveTrack({ ...libraryTrack, sourceProvider: 'fixture', sourceId: 'new' }),
  );
  const control = click(
    stale.data().components![0]!.toJSON().components[0]!.custom_id,
  );
  stale.collector.emit('collect', control);
  stale.collector.emit('collect', control);
  await vi.waitFor(() => expect(control.followUp).toHaveBeenCalledOnce());
  expect(reportError).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'LIBRARY_CHANGED' }),
    expect.anything(),
  );
  expect((await repository.liked('alice')).entries).toHaveLength(12);
  expect(audit.list(1, 1)[0]?.errorCode).toBe('LIBRARY_CHANGED');
  const expired = await run('liked', 'clear');
  expired.collector.emit('end', [], 'time');
  await vi.waitFor(() => expect(expired.data().content).toContain('expired'));
  expect((await repository.liked('alice')).entries).toHaveLength(12);
});
it('rejects missing current tracks and keeps another user library private', async () => {
  const { run, music, repository } = setup();
  await repository.create('alice', 'Private');
  expect(
    (await run('playlist', 'show', { name: 'Private' }, 'bob')).data().content,
  ).toContain('not found');
  music.currentTrack.mockImplementationOnce(() => {
    throw new MusicError('QUEUE_EMPTY', 'private internal');
  });
  expect((await run('like', '')).data().content).not.toContain(
    'private internal',
  );
  expect((await repository.liked('alice')).entries).toEqual([]);
});
