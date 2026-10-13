import { GameService } from './services/GameService.js';
import { DiscoveryService } from './services/DiscoveryService.js';
import { QueueControlService } from './services/QueueControlService.js';
import { PlaybackControlService } from './services/PlaybackControlService.js';
import { LyricsService } from './services/LyricsService.js';
import { RecommendationService } from './services/RecommendationService.js';
import { AutoplayService } from './services/AutoplayService.js';
import { StatisticsService } from './services/StatisticsService.js';
import { existsSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, REST } from 'discord.js';
import { normalizeGuildControls, connectGuildSettings } from '@kairo/data';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { createLogger, parseEnvironment } from '@kairo/shared';
import { AuditLog } from './commands/AuditLog.js';
import { createSlashCommandHandler } from './commands/slashCommandHandler.js';
import {
  addApplicationOwner,
  createBotMusicOptions,
  developerIdsFromEnvironment,
} from './config/music.js';
import { KairoMusicClient } from './services/KairoMusicClient.js';
import { logPlaybackEvents } from './services/logPlaybackEvents.js';
import { LibraryService } from './services/LibraryService.js';
import { PlaybackPolicyService } from './services/PlaybackPolicyService.js';
import { HistoryService } from './services/HistoryService.js';
import { MusicService } from './services/MusicService.js';
import { VoiceIdleManager } from './voice/VoiceIdleManager.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const environment = parseEnvironment(process.env);
const logger = createLogger(environment.LOG_LEVEL);
if (
  environment.KAIRO_FIXTURE_AUDIO_PATH &&
  !existsSync(environment.KAIRO_FIXTURE_AUDIO_PATH)
) {
  throw new Error('KAIRO_FIXTURE_AUDIO_PATH does not exist.');
}

const database = await connectGuildSettings(environment.MONGODB_URI, {
  maxEntries: environment.MUSIC_MAX_COLLECTION_ITEMS,
});
const engine = createKairoMusicEngine({
  ...createBotMusicOptions(environment),
  playbackDefaultsForGuild: async (guildId) => {
    const { volume, filter, repeat } = normalizeGuildControls(
      (await database.repository.get(guildId)).controls,
    );
    return { volume, filter, repeat };
  },
  audioQualityForGuild: async (guildId) =>
    (await database.repository.get(guildId)).audioQuality,
});
logPlaybackEvents(engine, logger);

const music = new MusicService(new KairoMusicClient(engine));
const history = new HistoryService(database.history, (error) =>
  logger.error({ err: error }, 'History persistence failed'),
);
history.attach(engine);
const audit = new AuditLog(500, database.audit, (error) =>
  logger.error({ err: error }, 'Audit persistence failed'),
);
const developerIds = new Set(developerIdsFromEnvironment(environment));
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const idle = new VoiceIdleManager(
  database.repository,
  (guildId) => {
    const guild = client.guilds.cache.get(guildId);
    const channelId =
      (client.user &&
        guild?.voiceStates.cache.get(client.user.id)?.channelId) ||
      music.voiceChannel(guildId);
    const humanCount =
      channelId && guild
        ? guild.voiceStates.cache.filter(
            (state) =>
              state.channelId === channelId &&
              state.id !== client.user?.id &&
              state.member?.user.bot !== true,
          ).size
        : 0;
    return { channelId, humanCount };
  },
  async (guildId) => {
    try {
      await music.disconnect(guildId);
      logger.info({ guildId }, 'Left empty voice channel');
    } catch {
      logger.error({ guildId }, 'Empty-channel disconnect failed');
    }
  },
);

const refreshIdle = async (guildId: string): Promise<void> => {
  await idle
    .refresh(guildId)
    .catch(() => logger.error({ guildId }, 'Voice idle check failed'));
};

const library = new LibraryService(database.library, music);
const games = new GameService(database.games, music, library);
const recommendations = new RecommendationService(music, history, library);
const autoplay = new AutoplayService(
  engine,
  database.repository,
  recommendations,
  (error) => logger.warn({ err: error }, 'Autoplay discovery failed'),
  (guildId) => {
    const id = music.voiceChannel(guildId);
    const guild = client.guilds.cache.get(guildId);
    return Boolean(
      id &&
      guild?.voiceStates.cache.some(
        (state) => state.channelId === id && state.member?.user.bot === false,
      ),
    );
  },
);
autoplay.attach();
const policy = new PlaybackPolicyService();
const controls = new PlaybackControlService(music, database.repository, policy);
const commandHandler = createSlashCommandHandler({
  music,
  games,
  history,
  statistics: new StatisticsService(database.history, database.library),
  policy,
  controls,
  queueControls: new QueueControlService(music, database.repository, policy),
  library,
  recommendations,
  discovery: new DiscoveryService(music, recommendations, library, history),
  lyrics: new LyricsService(),
  audit,
  settings: database.repository,
  developerIds,
  onSettingsChanged: async (guildId) => {
    await refreshIdle(guildId);
    await autoplay.settingsChanged(guildId);
  },
  onVoiceActivity: refreshIdle,
  reportError: (error, context) =>
    logger.error({ err: error, ...context }, 'Command execution failed'),
});

const rest = new REST({ version: '10' }).setToken(environment.DISCORD_TOKEN);

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guildId = newState.guild.id;
  if (
    newState.id === client.user?.id &&
    oldState.channelId &&
    !newState.channelId
  ) {
    idle.cancel(guildId);
    controls.votes.cancel(guildId);
    music.forgetVoiceChannel(guildId);
    void music
      .disconnect(guildId)
      .catch(() =>
        logger.error({ guildId }, 'Voice disconnect cleanup failed'),
      );
    return;
  }
  void refreshIdle(guildId);
  void controls
    .reconcile({ guild: newState.guild, guildId })
    .catch((error) =>
      logger.error({ err: error, guildId }, 'Skip vote reconciliation failed'),
    );
});

client.once(Events.ClientReady, async () => {
  logger.info({ clientId: client.user?.id }, 'Kairo ready');

  try {
    if (!client.application) throw new Error('Application unavailable');
    const application = await client.application.fetch();
    addApplicationOwner(developerIds, application.owner);
  } catch {
    logger.warn(
      'Application owner lookup failed; configured developer IDs remain active',
    );
  }

  try {
    await commandHandler.register(
      rest,
      environment.DISCORD_CLIENT_ID,
      environment.DISCORD_DEV_GUILD_ID,
    );
    logger.info(
      { count: commandHandler.names().length },
      'Commands registered',
    );
  } catch {
    logger.error('Command registration failed');
  }
});

client.on(Events.InteractionCreate, (interaction) => {
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isMessageContextMenuCommand() &&
    !interaction.isUserContextMenuCommand()
  )
    return;

  void commandHandler.execute(interaction).catch((error: unknown) => {
    logger.error(
      { err: error, command: interaction.commandName },
      'Command response failed',
    );
  });
});

client.on(Events.Error, (error) =>
  logger.error({ err: error }, 'Discord client error'),
);

let closing = false;
async function close(): Promise<void> {
  if (closing) return;
  closing = true;
  idle.shutdown();
  controls.votes.clear();
  await games.close();
  await autoplay.close();
  await engine.shutdown();
  await history.close();
  await audit.drain();
  client.destroy();
  await database.close();
}

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await client.login(environment.DISCORD_TOKEN);
