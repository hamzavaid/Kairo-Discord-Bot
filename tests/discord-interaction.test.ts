import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type {
  AudioQuality,
  GuildSettings,
  GuildSettingsRepository,
} from '../packages/data/src/GuildSettingsRepository.js';
import { describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';
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
    createdTimestamp: Date.now() - 10,
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

  return { interaction, deferReply, editReply, reply, followUp };
}

function createHandler() {
  const music = {
    play: vi.fn().mockResolvedValue({
      track: { title: 'Song' },
      position: 0,
    }),
    info: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
    queue: vi.fn(() => ({ current: undefined, upcoming: [] })),
    assertVoiceChannel: vi.fn(),
  } as unknown as MusicService;

  const settings: GuildSettingsRepository = {
    get: vi.fn(async (guildId: string): Promise<GuildSettings> => ({
      guildId,
      idleDisconnectSeconds: 60,
      audioQuality: 'high',
    })),

    setIdleDisconnectSeconds: vi.fn(
      async (guildId: string, seconds: number): Promise<GuildSettings> => ({
        guildId,
        idleDisconnectSeconds: seconds,
        audioQuality: 'high',
      }),
    ),

    setAudioQuality: vi.fn(
      async (
        guildId: string,
        audioQuality: AudioQuality,
      ): Promise<GuildSettings> => ({
        guildId,
        idleDisconnectSeconds: 60,
        audioQuality,
      }),
    ),
  };

  const handler = createSlashCommandHandler({
    music,
    audit: new AuditLog(),
    settings,
    developerIds: new Set(),
  });

  return { handler, music, settings };
}

describe('Discord slash command handling and registration', () => {
  it('passes Discord interaction data directly to the play command', async () => {
    const { handler, music } = createHandler();
    const built = createInteraction({ commandName: 'play', query: 'song' });

    await handler.execute(built.interaction);

    expect(built.deferReply).toHaveBeenCalledOnce();
    expect(music.play).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild',
        userId: 'user',
        query: 'song',
        voiceTarget: expect.objectContaining({
          guildId: 'guild',
          channelId: 'voice',
        }),
      }),
    );
    expect(built.editReply).toHaveBeenCalledWith({ content: 'Playing: Song' });
  });

  it('sends the help command as an ephemeral Components V2 reply', async () => {
    const { handler } = createHandler();
    const built = createInteraction({ commandName: 'help' });

    await handler.execute(built.interaction);

    expect(built.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      }),
    );
  });

  it('registers command data without invoking command execute methods', async () => {
    const { handler, music } = createHandler();
    const rest = { put: vi.fn(async () => ({})) };

    await handler.register(rest, '123456789012345678', '123456789012345679');

    expect(rest.put).toHaveBeenCalledWith(
      expect.stringContaining('/guilds/123456789012345679/commands'),
      { body: handler.registrationData() },
    );
    expect(music.play).not.toHaveBeenCalled();
  });

  it('reads settings options and Manage Guild permission in the command file', async () => {
    const { handler, settings } = createHandler();
    const built = createInteraction({
      commandName: 'settings',
      audioQuality: 'best',
      canManageGuild: true,
    });

    await handler.execute(built.interaction);

    expect(settings.setAudioQuality).toHaveBeenCalledWith('guild', 'best');
    expect(built.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });
});
