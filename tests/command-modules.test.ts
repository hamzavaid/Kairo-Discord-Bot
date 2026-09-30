import { describe, expect, it } from 'vitest';
import auditlogCommand from '../apps/bot/src/commands/developer/auditlog.js';
import disconnectCommand from '../apps/bot/src/commands/music/disconnect.js';
import pauseCommand from '../apps/bot/src/commands/music/pause.js';
import playCommand from '../apps/bot/src/commands/music/play.js';
import queueCommand from '../apps/bot/src/commands/music/queue.js';
import resumeCommand from '../apps/bot/src/commands/music/resume.js';
import skipCommand from '../apps/bot/src/commands/music/skip.js';
import stopCommand from '../apps/bot/src/commands/music/stop.js';
import helpCommand from '../apps/bot/src/commands/utility/help.js';
import infoCommand from '../apps/bot/src/commands/utility/info.js';
import pingCommand from '../apps/bot/src/commands/utility/ping.js';
import settingsCommand from '../apps/bot/src/commands/utility/settings.js';

const commands = [
  playCommand,
  pauseCommand,
  resumeCommand,
  skipCommand,
  stopCommand,
  disconnectCommand,
  queueCommand,
  pingCommand,
  settingsCommand,
  helpCommand,
  infoCommand,
  auditlogCommand,
];

describe('individual command modules', () => {
  it('exports guide-style data and execute properties for every command', () => {
    expect(commands.map((command) => command.data.name)).toEqual([
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

    for (const command of commands) {
      expect(command.data.description.length).toBeGreaterThan(0);
      expect(typeof command.execute).toBe('function');
    }
  });

  it('keeps command-specific registration options with each command', () => {
    const registration = commands.map((command) => command.data.toJSON());

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
