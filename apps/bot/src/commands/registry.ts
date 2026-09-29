import { SlashCommandBuilder } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { Track } from '@kairo/music-engine';
import type { MusicService } from '../services/MusicService.js';
import type { CommandDefinition, CommandContext } from './types.js';
import { CommandError } from '../errors.js';
import { AuditLog } from './AuditLog.js';

function guild(context: CommandContext): string {
  if (!context.guildId)
    throw new CommandError('GUILD_ONLY', 'Use this command in a server.');
  return context.guildId;
}

function query(context: CommandContext): string {
  const value = context.query?.trim();
  if (!value) throw new CommandError('MISSING_QUERY', 'Enter a song query.');
  return value;
}

function controlVoice(context: CommandContext, music: MusicService): string {
  const guildId = guild(context);
  if (!context.voiceChannelId)
    throw new CommandError('USER_NOT_IN_VOICE', 'Join a voice channel first.');
  music.assertVoiceChannel(guildId, context.voiceChannelId);
  return guildId;
}

function seconds(ms?: number): string {
  if (ms === undefined) return 'unknown';
  return `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
}

function infoText(track: Track): string {
  return [
    `Title: ${track.title}`,
    `Artists: ${track.artists.map((artist) => artist.name).join(', ')}`,
    ...(track.album ? [`Album: ${track.album.title}`] : []),
    `Duration: ${seconds(track.durationMs)}`,
    `Provider: ${track.sourceProvider}`,
    `Resolved by: ${track.provenance.parsedBy}`,
    ...(track.sourceId ? [`Source ID: ${track.sourceId}`] : []),
    ...(track.canonicalUrl ? [`URL: ${track.canonicalUrl}`] : []),
    ...(track.artworkUrl ? [`Artwork: ${track.artworkUrl}`] : []),
    ...(track.provenance.confidence === undefined
      ? []
      : [`Confidence: ${track.provenance.confidence.toFixed(2)}`]),
  ]
    .join('\n')
    .slice(0, 1900);
}

export class ApplicationCommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  add(command: CommandDefinition): void {
    if (this.commands.has(command.name))
      throw new Error(`Duplicate command: ${command.name}`);
    this.commands.set(command.name, command);
  }

  get(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  names(): string[] {
    return [...this.commands.keys()];
  }

  list(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  registrationData(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
    return this.list().map((command) => {
      const builder = new SlashCommandBuilder()
        .setName(command.name)
        .setDescription(command.description);
      if (command.queryOption)
        builder.addStringOption((option) =>
          option
            .setName('query')
            .setDescription('Song name or supported track URL')
            .setRequired(true),
        );
      if (command.pageOption)
        builder.addIntegerOption((option) =>
          option
            .setName('page')
            .setDescription('Audit page number')
            .setMinValue(1),
        );
      return builder.toJSON();
    });
  }
}

export function createCommandRegistry(
  music: MusicService,
  audit: AuditLog,
): ApplicationCommandRegistry {
  const registry = new ApplicationCommandRegistry();
  const add = (definition: CommandDefinition) => registry.add(definition);
  add({
    name: 'play',
    description: 'Play or queue a song',
    usage: '/play <query>',
    category: 'Music',
    queryOption: true,
    defer: true,
    async execute(context) {
      const guildId = guild(context);
      if (!context.voiceChannelId || !context.voiceTarget)
        throw new CommandError(
          'USER_NOT_IN_VOICE',
          'Join a voice channel first.',
        );
      const result = await music.play({
        guildId,
        userId: context.userId,
        query: query(context),
        voiceTarget: context.voiceTarget,
      });
      return {
        content:
          result.position === 0
            ? `Playing: ${result.track.title}`
            : `Queued #${result.position}: ${result.track.title}`,
      };
    },
  });
  add({
    name: 'pause',
    description: 'Pause playback',
    usage: '/pause',
    category: 'Music',
    async execute(context) {
      await music.pause(controlVoice(context, music));
      return { content: 'Playback paused.' };
    },
  });
  add({
    name: 'resume',
    description: 'Resume playback',
    usage: '/resume',
    category: 'Music',
    async execute(context) {
      await music.resume(controlVoice(context, music));
      return { content: 'Playback resumed.' };
    },
  });
  add({
    name: 'skip',
    description: 'Skip the current song',
    usage: '/skip',
    category: 'Music',
    async execute(context) {
      await music.skip(controlVoice(context, music));
      return { content: 'Skipped.' };
    },
  });
  add({
    name: 'stop',
    description: 'Stop playback and clear the queue',
    usage: '/stop',
    category: 'Music',
    async execute(context) {
      await music.stop(controlVoice(context, music));
      return { content: 'Playback stopped.' };
    },
  });
  add({
    name: 'queue',
    description: 'Show the current queue',
    usage: '/queue',
    category: 'Music',
    async execute(context) {
      const snapshot = music.queue(guild(context));
      const lines = [
        snapshot.current
          ? `Now: ${snapshot.current.track.title}`
          : 'Nothing playing.',
        ...snapshot.upcoming
          .slice(0, 10)
          .map((entry, index) => `${index + 1}. ${entry.track.title}`),
      ];
      if (snapshot.upcoming.length > 10)
        lines.push(`…and ${snapshot.upcoming.length - 10} more`);
      return { content: lines.join('\n').slice(0, 1900) };
    },
  });
  add({
    name: 'ping',
    description: 'Show bot latency',
    usage: '/ping',
    category: 'Utility',
    async execute(context) {
      const api = Math.max(0, Date.now() - context.createdTimestamp);
      const ws = context.websocketPing;
      return {
        content: `API: ${api} ms | WebSocket: ${ws === undefined || ws < 0 ? 'unavailable' : `${ws} ms`}`,
      };
    },
  });
  add({
    name: 'help',
    description: 'List commands',
    usage: '/help',
    category: 'Utility',
    async execute(context) {
      const categories = ['Music', 'Utility', 'Developer'] as const;
      return {
        content: categories
          .flatMap((category) => {
            const entries = registry
              .list()
              .filter(
                (item) =>
                  item.category === category &&
                  (!item.developerOnly || context.isDeveloper),
              );
            return entries.length
              ? [
                  `${category}:`,
                  ...entries.map(
                    (item) => `${item.usage} — ${item.description}`,
                  ),
                ]
              : [];
          })
          .join('\n')
          .slice(0, 1900),
        ephemeral: true,
      };
    },
  });
  add({
    name: 'info',
    description: 'Show song metadata without playing',
    usage: '/info <query>',
    category: 'Utility',
    queryOption: true,
    defer: true,
    async execute(context) {
      const track = await music.info(
        query(context),
        guild(context),
        context.userId,
      );
      return { content: infoText(track) };
    },
  });
  add({
    name: 'auditlog',
    description: 'Show recent Kairo commands',
    usage: '/auditlog [page]',
    category: 'Developer',
    pageOption: true,
    developerOnly: true,
    async execute(context) {
      const page = context.page ?? 1;
      const records = audit.list(page, 10);
      return {
        content: records.length
          ? records
              .map(
                (entry) =>
                  `${entry.timestamp} /${entry.command} user=${entry.userId} guild=${entry.guildId ?? 'DM'} ${entry.success ? 'ok' : `failed:${entry.errorCode ?? 'INTERNAL_ERROR'}`} ${entry.durationMs}ms`,
              )
              .join('\n')
              .slice(0, 1900)
          : 'No command records on this page.',
        ephemeral: true,
      };
    },
  });
  return registry;
}
