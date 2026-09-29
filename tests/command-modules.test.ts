import { describe, expect, it } from 'vitest';
import { createPlayCommand } from '../apps/bot/src/commands/music/play.js';
import { createPauseCommand } from '../apps/bot/src/commands/music/pause.js';
import { createResumeCommand } from '../apps/bot/src/commands/music/resume.js';
import { createSkipCommand } from '../apps/bot/src/commands/music/skip.js';
import { createStopCommand } from '../apps/bot/src/commands/music/stop.js';
import { createDisconnectCommand } from '../apps/bot/src/commands/music/disconnect.js';
import { createQueueCommand } from '../apps/bot/src/commands/music/queue.js';
import { createPingCommand } from '../apps/bot/src/commands/utility/ping.js';
import { createSettingsCommand } from '../apps/bot/src/commands/utility/settings.js';
import { createHelpCommand } from '../apps/bot/src/commands/utility/help.js';
import { createInfoCommand } from '../apps/bot/src/commands/utility/info.js';
import { createAuditlogCommand } from '../apps/bot/src/commands/developer/auditlog.js';
import { ApplicationCommandRegistry } from '../apps/bot/src/commands/registry.js';
import { AuditLog } from '../apps/bot/src/commands/AuditLog.js';
import type { MusicService } from '../apps/bot/src/services/MusicService.js';

describe('individual command modules', () => {
  it('exports one definition per command with distinct names and preserved registration options', () => {
    const music = {} as MusicService;
    const registry = new ApplicationCommandRegistry();
    const commands = [
      createPlayCommand(music),
      createPauseCommand(music),
      createResumeCommand(music),
      createSkipCommand(music),
      createStopCommand(music),
      createDisconnectCommand(music),
      createQueueCommand(music),
      createPingCommand(),
      createSettingsCommand(),
      createHelpCommand(registry),
      createInfoCommand(music),
      createAuditlogCommand(new AuditLog()),
    ];
    expect(commands.map((command) => command.name)).toEqual([
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
    for (const command of commands) registry.add(command);
    const registration = registry.registrationData();
    expect(
      registration.find((command) => command.name === 'play')?.options?.[0]
        ?.name,
    ).toBe('query');
    expect(
      registration.find((command) => command.name === 'settings')?.options?.[0]
        ?.name,
    ).toBe('timeout_seconds');
    expect(
      registration.find((command) => command.name === 'settings')?.options?.[1]
        ?.name,
    ).toBe('audio_quality');
    expect(
      registration.find((command) => command.name === 'auditlog')?.options?.[0]
        ?.name,
    ).toBe('page');
  });
});
