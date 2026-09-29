import { describe, expect, it, vi } from 'vitest';
import { MusicError } from '@kairo/music-engine';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import { createCommandRegistry } from '../apps/bot/src/commands/registry.js';
import { InteractionRouter } from '../apps/bot/src/commands/InteractionRouter.js';
import type { CommandRequest } from '../apps/bot/src/commands/types.js';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';

function setup() {
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
  const settings = new Map<string, number>();
  const settingsRepository = {
    get: vi.fn(async (guildId: string) => ({
      guildId,
      idleDisconnectSeconds: settings.get(guildId) ?? 60,
    })),
    setIdleDisconnectSeconds: vi.fn(async (guildId: string, value: number) => {
      if (!Number.isInteger(value) || value < 0 || value > 3600)
        throw new RangeError('Invalid timeout');
      settings.set(guildId, value);
      return { guildId, idleDisconnectSeconds: value };
    }),
  };
  const registry = createCommandRegistry(
    music as unknown as MusicService,
    audit,
    settingsRepository,
  );
  const router = new InteractionRouter(registry, audit, new Set(['developer']));
  const responses: string[] = [];
  const request = (name: string, extra: Partial<CommandRequest> = {}) => ({
    name,
    userId: 'user',
    guildId: 'guild',
    voiceChannelId: 'voice',
    voiceTarget: {
      guildId: 'guild',
      channelId: 'voice',
      adapterCreator: (() => ({})) as never,
    },
    query: 'song',
    createdTimestamp: Date.now() - 20,
    websocketPing: 10,
    defer: vi.fn(async () => {}),
    respond: vi.fn(async (content: string) => {
      responses.push(content);
    }),
    ...extra,
  });
  return {
    music,
    audit,
    registry,
    router,
    request,
    responses,
    settingsRepository,
  };
}

describe('Phase 6 command routing and audits', () => {
  it('registers commands separately and generates help from the registry', async () => {
    const { registry, router, request, responses } = setup();
    expect(registry.names()).toEqual([
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
    expect(registry.registrationData()).toHaveLength(12);
    await router.execute(request('help'));
    expect(responses[0]).toContain('/play <query>');
    expect(responses[0]).toContain('/ping');
    expect(responses[0]).not.toContain('/auditlog');
  });

  it('routes play with voice context and defers the slow operation', async () => {
    const { music, router, request, audit } = setup();
    const command = request('play');
    await router.execute(command);
    expect(command.defer).toHaveBeenCalledOnce();
    expect(music.play).toHaveBeenCalledWith({
      guildId: 'guild',
      userId: 'user',
      query: 'song',
      voiceTarget: command.voiceTarget,
    });
    expect(command.respond).toHaveBeenCalledWith(
      expect.stringContaining('Song'),
      false,
    );
    expect(audit.list(1, 10)[0]).toMatchObject({
      command: 'play',
      userId: 'user',
      guildId: 'guild',
      success: true,
    });
  });

  it('rejects users outside voice before play reaches MusicService', async () => {
    const { music, router, request, audit } = setup();
    await router.execute(request('play', { voiceChannelId: undefined }));
    expect(music.play).not.toHaveBeenCalled();
    expect(audit.list(1, 10)[0]).toMatchObject({
      success: false,
      errorCode: 'USER_NOT_IN_VOICE',
    });
  });

  it('routes pause, resume, skip, stop, and queue through MusicService', async () => {
    const { music, router, request } = setup();
    for (const name of ['pause', 'resume', 'skip', 'stop', 'queue'])
      await router.execute(request(name));
    expect(music.pause).toHaveBeenCalledWith('guild');
    expect(music.resume).toHaveBeenCalledWith('guild');
    expect(music.skip).toHaveBeenCalledWith('guild');
    expect(music.stop).toHaveBeenCalledWith('guild');
    expect(music.queue).toHaveBeenCalledWith('guild');
  });

  it('disconnects through MusicService without needing the user in voice', async () => {
    const { music, router, request } = setup();
    await router.execute(request('disconnect', { voiceChannelId: undefined }));
    expect(music.disconnect).toHaveBeenCalledWith('guild');
  });

  it('shows default guild settings and restricts changes to server managers', async () => {
    const { router, request, responses, audit, settingsRepository } = setup();
    await router.execute(request('settings'));
    expect(responses.at(-1)).toContain('60 seconds');
    await router.execute(request('settings', { timeoutSeconds: 120 }));
    expect(audit.list(1, 1)[0]?.errorCode).toBe('UNAUTHORIZED');
    expect(settingsRepository.setIdleDisconnectSeconds).not.toHaveBeenCalled();
    await router.execute(
      request('settings', { timeoutSeconds: 120, canManageGuild: true }),
    );
    expect(responses.at(-1)).toContain('120 seconds');
    await router.execute(
      request('settings', { timeoutSeconds: 0, canManageGuild: true }),
    );
    expect(responses.at(-1)).toContain('disabled');
  });

  it('returns ping latency without calling music', async () => {
    const { music, router, request, responses } = setup();
    await router.execute(request('ping'));
    expect(responses[0]).toMatch(/API: \d+ ms.*WebSocket: 10 ms/u);
    expect(music.info).not.toHaveBeenCalled();
  });

  it('resolves info without queueing or connecting', async () => {
    const { music, router, request, responses } = setup();
    await router.execute(request('info'));
    expect(music.info).toHaveBeenCalledWith('song', 'guild', 'user');
    expect(music.play).not.toHaveBeenCalled();
    expect(responses[0]).toContain('Album');
    expect(responses[0]).toContain('fixture');
    expect(responses[0]).toContain('Confidence: 0.90');
    expect(responses[0]).toContain('Resolved by: fixture');
  });

  it('maps typed engine failures to safe command responses and audit codes', async () => {
    const { music, router, request, audit, responses } = setup();
    for (const code of [
      'QUEUE_EMPTY',
      'NO_RELIABLE_MATCH',
      'STREAM_UNAVAILABLE',
      'VOICE_JOIN_ERROR',
      'INVALID_PLAYBACK_TRANSITION',
      'PROVIDER_TIMEOUT',
    ] as const) {
      music.info.mockRejectedValueOnce(new MusicError(code, 'unsafe detail'));
      await router.execute(request('info'));
      expect(responses.at(-1)).not.toContain('unsafe detail');
      expect(audit.list(1, 1)[0]?.errorCode).toBe(code);
    }
  });

  it('enforces developer-only audit access and returns prior records', async () => {
    const { router, request, audit, responses } = setup();
    await router.execute(request('ping'));
    await router.execute(request('auditlog'));
    expect(audit.list(1, 10)[0]).toMatchObject({
      command: 'auditlog',
      success: false,
      errorCode: 'UNAUTHORIZED',
    });
    await router.execute(request('auditlog', { userId: 'developer' }));
    expect(responses.at(-1)).toContain('ping');
    expect(responses.at(-1)).toContain('user');
    expect(responses.at(-1)).not.toContain('DISCORD_TOKEN');
  });

  it('audits failures using only stable error codes', async () => {
    const { music, router, request, audit, responses } = setup();
    music.info.mockRejectedValue(new Error('sensitive provider payload'));
    await router.execute(request('info'));
    expect(responses.at(-1)).not.toContain('sensitive provider payload');
    expect(audit.list(1, 10)[0]).toMatchObject({
      command: 'info',
      success: false,
      errorCode: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(audit.list(1, 10))).not.toContain('sensitive');
  });
});
