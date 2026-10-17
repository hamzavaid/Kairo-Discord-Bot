import { expect, it, vi } from 'vitest';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { DiagnosticsService } from '../apps/bot/src/services/DiagnosticsService.js';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';

it('reports readiness and provider/session state without track payloads or credentials', async () => {
  const engine = createKairoMusicEngine();
  const diagnostic = new DiagnosticsService(
    engine,
    async () => ({ status: 'healthy' }),
    () => true,
  );
  expect((await diagnostic.health()).ready).toBe(false);
  diagnostic.ready([
    { name: 'ffprobe', status: 'degraded', code: 'CHECK_FAILED' },
  ]);
  expect(await diagnostic.health()).toMatchObject({
    ready: true,
    status: 'degraded',
  });
  expect(diagnostic.session('g')).toMatchObject({
    state: 'DISCONNECTED',
    queued: 0,
  });
  diagnostic.stopping();
  expect((await diagnostic.health()).ready).toBe(false);
  await engine.shutdown();
});
it('registers all diagnostics and enforces developer authorization through the existing handler', async () => {
  const health = vi.fn(async () => ({
    status: 'healthy',
    ready: true,
    database: 'healthy',
    resources: {},
  }));
  const handler = createSlashCommandHandler({
    music: {} as never,
    audit: new AuditLog(),
    settings: {} as never,
    developerIds: new Set(['dev']),
    diagnostics: { health } as never,
  });
  for (const name of ['health', 'providerstatus', 'sessioninfo'])
    expect(handler.registrationData().some((d) => d.name === name)).toBe(true);
  const reply = vi.fn();
  await handler.execute({
    commandName: 'health',
    user: { id: 'other' },
    reply,
  } as never);
  expect(health).not.toHaveBeenCalled();
  expect(JSON.stringify(reply.mock.calls)).toContain('not authorized');
  await handler.execute({
    commandName: 'health',
    user: { id: 'dev' },
    reply,
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as never);
  expect(health).toHaveBeenCalledTimes(1);
  handler.close();
});
