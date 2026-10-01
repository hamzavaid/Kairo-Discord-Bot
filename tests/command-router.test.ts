import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { MusicError } from '@kairo/music-engine';
import type {
  AudioQuality,
  GuildSettingsRepository,
} from '../packages/data/src/GuildSettingsRepository.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import {
  createSlashCommandHandler,
  type ErrorReporter,
} from '../apps/bot/src/commands/slashCommandHandler.js';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';

interface InteractionOptions {
  userId?: string;
  guildId?: string | null;
  voiceChannelId?: string | undefined;
  query?: string | null;
  page?: number | null;
  timeoutSeconds?: number | null;
  audioQuality?: AudioQuality | null;
  canManageGuild?: boolean;
  createdTimestamp?: number;
  websocketPing?: number;
}

function createInteraction(name: string, options: InteractionOptions = {}) {
  let deferred = false;
  let replied = false;

  const reply = vi.fn(async () => {
    replied = true;
  });
  const deferReply = vi.fn(async () => {
    deferred = true;
  });
  const editReply = vi.fn(async () => {});
  const followUp = vi.fn(async () => {});

  const userId = options.userId ?? 'user';
  const guildId = options.guildId === undefined ? 'guild' : options.guildId;
  const voiceChannelId = options.voiceChannelId;

  const interaction = {
    commandName: name,
    user: { id: userId },
    guildId,
    guild:
      guildId === null
        ? null
        : {
            voiceAdapterCreator: vi.fn(),
            voiceStates: {
              cache: new Map(
                voiceChannelId ? [[userId, { channelId: voiceChannelId }]] : [],
              ),
            },
          },
    client: { ws: { ping: options.websocketPing ?? 10 } },
    createdTimestamp: options.createdTimestamp ?? Date.now() - 20,
    options: {
      getString: vi.fn((key: string) => {
        if (key === 'query') return options.query ?? null;
        if (key === 'audio_quality') return options.audioQuality ?? null;
        return null;
      }),
      getInteger: vi.fn((key: string) => {
        if (key === 'page') return options.page ?? null;
        if (key === 'timeout_seconds') return options.timeoutSeconds ?? null;
        return null;
      }),
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
    reply,
    editReply,
    followUp,
  } as unknown as ChatInputCommandInteraction;

  return { interaction, reply, deferReply, editReply, followUp };
}

function setup(reportError?: ErrorReporter) {
  const music = {
    play: vi.fn().mockResolvedValue({
      track: { title: 'Song', artists: [{ name: 'Artist' }] },
      position: 0,
    }),
    info: vi.fn().mockResolvedValue({
      title: 'Song',
      artists: [{ name: 'Artist' }],
      album: { title: 'Album' },
      durationMs: 180_000,
      sourceProvider: 'fixture',
      sourceId: 'one',
      canonicalUrl: 'https://fixture.kairo.invalid/tracks/one',
      provenance: { parsedBy: 'fixture', confidence: 0.9 },
    }),
    pause: vi.fn().mockResolvedValue({ state: 'PAUSED' }),
    resume: vi.fn().mockResolvedValue({ state: 'PLAYING' }),
    skip: vi.fn().mockResolvedValue({ current: undefined }),
    stop: vi.fn().mockResolvedValue({ current: undefined }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    queue: vi.fn().mockReturnValue({ current: undefined, upcoming: [] }),
    assertVoiceChannel: vi.fn(),
  };

  const audit = new AuditLog();
  const settings = new Map<
    string,
    { timeout: number; quality: AudioQuality }
  >();
  const settingsRepository: GuildSettingsRepository = {
    get: vi.fn(async (guildId: string) => ({
      guildId,
      idleDisconnectSeconds: settings.get(guildId)?.timeout ?? 60,
      audioQuality: settings.get(guildId)?.quality ?? 'high',
    })),
    setIdleDisconnectSeconds: vi.fn(async (guildId: string, value: number) => {
      settings.set(guildId, {
        timeout: value,
        quality: settings.get(guildId)?.quality ?? 'high',
      });
      return {
        guildId,
        idleDisconnectSeconds: value,
        audioQuality: settings.get(guildId)!.quality,
      };
    }),
    setAudioQuality: vi.fn(async (guildId: string, quality: AudioQuality) => {
      settings.set(guildId, {
        timeout: settings.get(guildId)?.timeout ?? 60,
        quality,
      });
      return {
        guildId,
        idleDisconnectSeconds: settings.get(guildId)!.timeout,
        audioQuality: quality,
      };
    }),
  };

  const developerIds = new Set(['developer']);
  const handler = createSlashCommandHandler({
    music: music as unknown as MusicService,
    audit,
    settings: settingsRepository,
    developerIds,
    ...(reportError ? { reportError } : {}),
  });

  const run = async (name: string, options: InteractionOptions = {}) => {
    const built = createInteraction(name, {
      voiceChannelId: 'voice',
      query: 'song',
      ...options,
    });
    await handler.execute(built.interaction);
    return built;
  };

  return { music, audit, handler, run, settingsRepository };
}

function lastPayload(mock: ReturnType<typeof vi.fn>): unknown {
  return mock.mock.calls.at(-1)?.[0];
}

function responseText(
  result: Awaited<ReturnType<ReturnType<typeof setup>['run']>>,
) {
  const payload =
    lastPayload(result.editReply) ??
    lastPayload(result.reply) ??
    lastPayload(result.followUp);
  return JSON.stringify(payload);
}

describe('slash command handler and audits', () => {
  it('loads all commands and generates help from the handler collection', async () => {
    const { handler, run } = setup();
    expect(handler.names()).toEqual([
      'play',
      'pause',
      'resume',
      'skip',
      'stop',
      'disconnect',
      'queue',
      'ping',
      'settings',
      'help',
      'info',
      'auditlog',
    ]);
    expect(handler.registrationData()).toHaveLength(12);

    const result = await run('help');
    const payload = lastPayload(result.reply) as {
      flags?: number;
      components?: unknown[];
    };

    expect(payload.flags).toBe(
      MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    );
    const text = JSON.stringify(payload.components);
    expect(text).toContain('## Help Command');
    expect(text).toContain('Choose a command category...');
    expect(text).toContain('"label":"Music"');
    expect(text).toContain('"label":"Utility"');

    // Non-developers should not see the Developer category.
    expect(text).not.toContain('"label":"Developer"');

    // Commands are not shown until a category is selected.
    expect(text).not.toContain('/play <query>');
    expect(text).not.toContain('/ping');
    expect(text).not.toContain('/auditlog');
  });

  it('routes play with voice context and defers the slow operation', async () => {
    const { music, run, audit } = setup();
    const result = await run('play');

    expect(result.deferReply).toHaveBeenCalledOnce();
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
    expect(result.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Song') }),
    );
    expect(audit.list(1, 10)[0]).toMatchObject({
      command: 'play',
      userId: 'user',
      guildId: 'guild',
      success: true,
    });
  });

  it('rejects users outside voice before play reaches MusicService', async () => {
    const { music, run, audit } = setup();
    await run('play', { voiceChannelId: undefined });
    expect(music.play).not.toHaveBeenCalled();
    expect(audit.list(1, 10)[0]).toMatchObject({
      success: false,
      errorCode: 'USER_NOT_IN_VOICE',
    });
  });

  it('routes pause, resume, skip, stop, and queue through MusicService', async () => {
    const { music, run } = setup();
    for (const name of ['pause', 'resume', 'skip', 'stop', 'queue'])
      await run(name);
    expect(music.pause).toHaveBeenCalledWith('guild');
    expect(music.resume).toHaveBeenCalledWith('guild');
    expect(music.skip).toHaveBeenCalledWith('guild');
    expect(music.stop).toHaveBeenCalledWith('guild');
    expect(music.queue).toHaveBeenCalledWith('guild');
  });

  it('disconnects through MusicService without needing the user in voice', async () => {
    const { music, run } = setup();
    await run('disconnect', { voiceChannelId: undefined });
    expect(music.disconnect).toHaveBeenCalledWith('guild');
  });

  it('shows default guild settings and restricts changes to server managers', async () => {
    const { run, audit, settingsRepository } = setup();

    expect(responseText(await run('settings'))).toContain('60 seconds');

    await run('settings', { timeoutSeconds: 120 });
    expect(audit.list(1, 1)[0]?.errorCode).toBe('UNAUTHORIZED');
    expect(settingsRepository.setIdleDisconnectSeconds).not.toHaveBeenCalled();

    expect(
      responseText(
        await run('settings', {
          timeoutSeconds: 120,
          canManageGuild: true,
        }),
      ),
    ).toContain('120 seconds');

    expect(
      responseText(
        await run('settings', {
          timeoutSeconds: 0,
          canManageGuild: true,
        }),
      ),
    ).toContain('disabled');
  });

  it('shows and saves audio quality with server-side permission checks', async () => {
    const { run, settingsRepository } = setup();

    expect(responseText(await run('settings'))).toContain('high');

    await run('settings', { audioQuality: 'best' });
    expect(settingsRepository.setAudioQuality).not.toHaveBeenCalled();

    expect(
      responseText(
        await run('settings', {
          audioQuality: 'low',
          canManageGuild: true,
        }),
      ),
    ).toContain('low');
    expect(settingsRepository.setAudioQuality).toHaveBeenCalledWith(
      'guild',
      'low',
    );
  });

  it('returns ping latency without calling music', async () => {
    const { music, run } = setup();
    const result = await run('ping');
    expect(responseText(result)).toMatch(/API: \d+ ms.*WebSocket: 10 ms/u);
    expect(music.info).not.toHaveBeenCalled();
  });

  it('resolves info without queueing or connecting', async () => {
    const { music, run } = setup();
    const result = await run('info');
    expect(music.info).toHaveBeenCalledWith('song', 'guild', 'user');
    expect(music.play).not.toHaveBeenCalled();
    const text = responseText(result);
    expect(text).toContain('Album');
    expect(text).toContain('fixture');
    expect(text).toContain('Confidence: 0.90');
    expect(text).toContain('Resolved by: fixture');
  });

  it('maps typed engine failures to safe command responses and audit codes', async () => {
    const { music, run, audit } = setup();
    for (const code of [
      'QUEUE_EMPTY',
      'NO_RELIABLE_MATCH',
      'STREAM_UNAVAILABLE',
      'VOICE_JOIN_ERROR',
      'INVALID_PLAYBACK_TRANSITION',
      'PROVIDER_TIMEOUT',
    ] as const) {
      music.info.mockRejectedValueOnce(new MusicError(code, 'unsafe detail'));
      const result = await run('info');
      expect(responseText(result)).not.toContain('unsafe detail');
      expect(audit.list(1, 1)[0]?.errorCode).toBe(code);
    }
  });

  it('enforces developer-only audit access and returns prior records', async () => {
    const { run, audit } = setup();
    await run('ping');
    await run('auditlog');
    expect(audit.list(1, 10)[0]).toMatchObject({
      command: 'auditlog',
      success: false,
      errorCode: 'UNAUTHORIZED',
    });

    const developerResult = await run('auditlog', { userId: 'developer' });
    const text = responseText(developerResult);
    expect(text).toContain('ping');
    expect(text).toContain('user');
    expect(text).not.toContain('DISCORD_TOKEN');
  });

  it('audits failures using only stable error codes', async () => {
    const { music, run, audit } = setup();
    music.info.mockRejectedValue(new Error('sensitive provider payload'));
    const result = await run('info');
    expect(responseText(result)).not.toContain('sensitive provider payload');
    expect(audit.list(1, 10)[0]).toMatchObject({
      command: 'info',
      success: false,
      errorCode: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(audit.list(1, 10))).not.toContain('sensitive');
  });

  it('reports the original command error while replying safely', async () => {
    const reportError = vi.fn();
    const { music, run } = setup(reportError);
    const failure = new Error('component layout failed');
    music.info.mockRejectedValueOnce(failure);

    const result = await run('info');

    expect(reportError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ command: 'info', code: 'INTERNAL_ERROR' }),
    );
    expect(result.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'The command could not be completed.',
      }),
    );
  });
});
