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
      options: { getString: () => 'query' },
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
      options: { getString: () => 'query' },
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
