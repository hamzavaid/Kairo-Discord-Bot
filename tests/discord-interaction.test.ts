import { ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';
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
    await command.respond({ content: 'queued' });
    expect(deferReply).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith({
      content: 'queued',
      allowedMentions: { parse: [] },
    });
    expect(reply).not.toHaveBeenCalled();
  });

  it('sends Components V2 replies without a content field', async () => {
    const reply = vi.fn(async () => {});
    const interaction = {
      commandName: 'help',
      user: { id: 'user' },
      guildId: 'guild',
      guild: { voiceStates: { cache: new Map() } },
      client: { ws: { ping: 0 } },
      createdTimestamp: 0,
      options: { getString: () => null, getInteger: () => null },
      deferred: false,
      replied: false,
      reply,
    } as unknown as Parameters<typeof toCommandRequest>[0];
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Help'),
    );
    await toCommandRequest(interaction).respond({
      components: [container],
      ephemeral: true,
      flags: MessageFlags.IsComponentsV2,
    });
    expect(reply).toHaveBeenCalledWith({
      components: [container],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
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

  it('reads the audio quality option from a settings interaction', () => {
    const interaction = {
      commandName: 'settings',
      user: { id: 'user' },
      guildId: 'guild',
      guild: { voiceStates: { cache: new Map() } },
      client: { ws: { ping: 0 } },
      createdTimestamp: 0,
      options: {
        getString: (name: string) => (name === 'audio_quality' ? 'best' : null),
        getInteger: () => null,
      },
      memberPermissions: { has: () => true },
    } as unknown as Parameters<typeof toCommandRequest>[0];
    expect(toCommandRequest(interaction)).toMatchObject({
      name: 'settings',
      audioQuality: 'best',
      canManageGuild: true,
    });
  });
});
