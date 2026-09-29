import { describe, expect, it, vi } from 'vitest';
import { toCommandRequest } from '../apps/bot/src/commands/discordAdapter.js';
import { registerCommands } from '../apps/bot/src/commands/registerCommands.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { createCommandRegistry } from '../apps/bot/src/commands/registry.js';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';

describe('Discord interaction adapter and registration', () => {
  it('extracts voice, query, latency and reply behavior from a chat command', async () => {
    const deferReply = vi.fn(async () => {});
    const editReply = vi.fn(async () => {});
    const reply = vi.fn(async () => {});
    const interaction = {
      commandName: 'play',
      user: { id: 'user' },
      guildId: 'guild',
      guild: {
        voiceAdapterCreator: vi.fn(),
        voiceStates: { cache: new Map([['user', { channelId: 'voice' }]]) },
      },
      client: { ws: { ping: 42 } },
      createdTimestamp: 100,
      options: {
        getString: vi.fn(() => 'song'),
        getInteger: vi.fn(() => null),
      },
      deferred: false,
      replied: false,
      deferReply,
      editReply,
      reply,
    } as unknown as Parameters<typeof toCommandRequest>[0];
    const command = toCommandRequest(interaction);
    expect(command).toMatchObject({
      name: 'play',
      userId: 'user',
      guildId: 'guild',
      voiceChannelId: 'voice',
      query: 'song',
      websocketPing: 42,
      voiceTarget: { guildId: 'guild', channelId: 'voice' },
    });
    await command.defer();
    await command.respond('queued', false);
    expect(deferReply).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith({
      content: 'queued',
      allowedMentions: { parse: [] },
    });
    expect(reply).not.toHaveBeenCalled();
  });

  it('registers command definitions without invoking their handlers', async () => {
    const rest = { put: vi.fn(async () => ({})) };
    const music = { play: vi.fn() } as unknown as MusicService;
    const registry = createCommandRegistry(music, new AuditLog());
    await registerCommands(
      registry,
      rest,
      '123456789012345678',
      '123456789012345679',
    );
    expect(rest.put).toHaveBeenCalledWith(
      expect.stringContaining('/guilds/123456789012345679/commands'),
      { body: registry.registrationData() },
    );
    expect(
      (music as unknown as { play: ReturnType<typeof vi.fn> }).play,
    ).not.toHaveBeenCalled();
  });
});
