import { existsSync } from 'node:fs';
import { Client, GatewayIntentBits, Events, REST } from 'discord.js';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { createLogger, parseEnvironment } from '@kairo/shared';
import { connectGuildSettings } from '@kairo/data';
import { KairoMusicClient } from './services/KairoMusicClient.js';
import { MusicService } from './services/MusicService.js';
import { logPlaybackEvents } from './services/logPlaybackEvents.js';
import {
  addApplicationOwner,
  createBotMusicOptions,
  developerIdsFromEnvironment,
} from './config/music.js';
import { AuditLog } from './commands/AuditLog.js';
import { createCommandRegistry } from './commands/registry.js';
import { InteractionRouter } from './commands/InteractionRouter.js';
import { toCommandRequest } from './commands/discordAdapter.js';
import { registerCommands } from './commands/registerCommands.js';
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
const database = await connectGuildSettings(environment.MONGODB_URI);
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
const registry = createCommandRegistry(
  music,
  audit,
  database.repository,
  async (guildId) => {
    await idle
      .refresh(guildId)
      .catch(() => logger.error({ guildId }, 'Voice idle check failed'));
  },
  async (guildId) => {
    await idle
      .refresh(guildId)
      .catch(() => logger.error({ guildId }, 'Voice idle check failed'));
  },
);
const router = new InteractionRouter(registry, audit, developerIds);
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
  void idle
    .refresh(guildId)
    .catch(() => logger.error({ guildId }, 'Voice idle check failed'));
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
    await registerCommands(
      registry,
      rest,
      environment.DISCORD_CLIENT_ID,
      environment.DISCORD_DEV_GUILD_ID,
    );
    logger.info({ count: registry.names().length }, 'Commands registered');
  } catch {
    logger.error('Command registration failed');
  }
});
client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  void router.execute(toCommandRequest(interaction)).catch(() => {
    logger.error('Command response failed');
  });
});
client.on(Events.Error, () => logger.error('Discord client error'));

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
