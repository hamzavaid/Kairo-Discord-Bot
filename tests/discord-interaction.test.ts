import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { executeSlashCommand } from '../apps/bot/src/commands/slashCommandHandler.js';
import { registerCommands } from '../apps/bot/src/commands/registerCommands.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { createCommandRegistry } from '../apps/bot/src/commands/registry.js';
import type {
  CommandContext,
  CommandDefinition,
} from '../apps/bot/src/commands/types.js';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';

function createInteraction(options: {
  commandName: string;
  query?: string | null;
  audioQuality?: string | null;
  canManageGuild?: boolean;
}) {
  let deferred = false;
  let replied = false;

  const deferReply = vi.fn(async () => {
    deferred = true;
  });
  const editReply = vi.fn(async () => {});
  const reply = vi.fn(async () => {
    replied = true;
  });
  const followUp = vi.fn(async () => {});

  const interaction = {
    commandName: options.commandName,
    user: { id: 'user' },
    guildId: 'guild',
    guild: {
      voiceAdapterCreator: vi.fn(),
      voiceStates: { cache: new Map([['user', { channelId: 'voice' }]]) },
    },
    client: { ws: { ping: 42 } },
    createdTimestamp: 100,
    options: {
      getString: vi.fn((name: string) => {
        if (name === 'query') return options.query ?? null;
        if (name === 'audio_quality') return options.audioQuality ?? null;
        return null;
      }),
      getInteger: vi.fn(() => null),
    },
    memberPermissions: {
      has: vi.fn(() => options.canManageGuild ?? false),
    },
    get deferred() {
      return deferred;
    },
    get replied() {
      return replied;
    },
    deferReply,
    editReply,
    reply,
    followUp,
  } as unknown as ChatInputCommandInteraction;

  return {
    interaction,
    deferReply,
    editReply,
    reply,
    followUp,
  };
}

describe('Discord slash command handling and registration', () => {
  it('extracts voice, query, latency and deferred reply behavior from a chat command', async () => {
    let captured: CommandContext | undefined;
    const command: CommandDefinition = {
      name: 'play',
      description: 'Play',
      usage: '/play <query>',
      category: 'Music',
      defer: true,
      async execute(context) {
        captured = context;
        return { content: 'queued' };
      },
    };

    const built = createInteraction({
      commandName: 'play',
      query: 'song',
    });

    await executeSlashCommand(
      built.interaction,
      command,
      new AuditLog(),
      new Set(),
    );

    expect(captured).toMatchObject({
      name: 'play',
      userId: 'user',
      guildId: 'guild',
      voiceChannelId: 'voice',
      query: 'song',
      websocketPing: 42,
      voiceTarget: { guildId: 'guild', channelId: 'voice' },
    });
    expect(built.deferReply).toHaveBeenCalledOnce();
    expect(built.editReply).toHaveBeenCalledWith({
      content: 'queued',
      allowedMentions: { parse: [] },
    });
    expect(built.reply).not.toHaveBeenCalled();
  });

  it('sends Components V2 replies without a content field', async () => {
    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Help'),
    );
    const command: CommandDefinition = {
      name: 'help',
      description: 'Help',
      usage: '/help',
      category: 'Utility',
      async execute() {
        return {
          components: [container],
          ephemeral: true,
          flags: MessageFlags.IsComponentsV2,
        };
      },
    };
    const built = createInteraction({ commandName: 'help' });

    await executeSlashCommand(
      built.interaction,
      command,
      new AuditLog(),
      new Set(),
    );

    expect(built.reply).toHaveBeenCalledWith({
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

  it('reads the audio quality option and Manage Guild permission from a settings interaction', async () => {
    let captured: CommandContext | undefined;
    const command: CommandDefinition = {
      name: 'settings',
      description: 'Settings',
      usage: '/settings',
      category: 'Utility',
      async execute(context) {
        captured = context;
        return { content: 'ok' };
      },
    };
    const built = createInteraction({
      commandName: 'settings',
      audioQuality: 'best',
      canManageGuild: true,
    });

    await executeSlashCommand(
      built.interaction,
      command,
      new AuditLog(),
      new Set(),
    );

    expect(captured).toMatchObject({
      name: 'settings',
      audioQuality: 'best',
      canManageGuild: true,
    });
  });
});
