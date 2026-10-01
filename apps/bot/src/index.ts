import { existsSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, REST } from 'discord.js';
import { connectGuildSettings } from '@kairo/data';
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
  audioQualityForGuild: async (guildId) =>
    (await database.repository.get(guildId)).audioQuality,
});
logPlaybackEvents(engine, logger);

const music = new MusicService(new KairoMusicClient(engine));
const audit = new AuditLog();
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

const commandHandler = createSlashCommandHandler({
  music,
  library: new LibraryService(database.library, music),
  audit,
  settings: database.repository,
  developerIds,
  onSettingsChanged: refreshIdle,
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
    music.forgetVoiceChannel(guildId);
    void music
      .disconnect(guildId)
      .catch(() =>
        logger.error({ guildId }, 'Voice disconnect cleanup failed'),
      );
    return;
  }
  void refreshIdle(guildId);
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
  if (!interaction.isChatInputCommand()) return;

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
  await engine.shutdown();
  client.destroy();
  await database.close();
}

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await client.login(environment.DISCORD_TOKEN);
