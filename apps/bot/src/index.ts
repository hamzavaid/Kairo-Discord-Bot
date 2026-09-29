import { existsSync } from 'node:fs';
import { Client, GatewayIntentBits, Events, REST } from 'discord.js';
import { createKairoMusicEngine } from '@kairo/music-engine';
import { createLogger, parseEnvironment } from '@kairo/shared';
import { KairoMusicClient } from './services/KairoMusicClient.js';
import { MusicService } from './services/MusicService.js';
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

if (existsSync('.env')) process.loadEnvFile('.env');
const environment = parseEnvironment(process.env);
const logger = createLogger(environment.LOG_LEVEL);
if (
  environment.KAIRO_FIXTURE_AUDIO_PATH &&
  !existsSync(environment.KAIRO_FIXTURE_AUDIO_PATH)
) {
  throw new Error('KAIRO_FIXTURE_AUDIO_PATH does not exist.');
}
const engine = createKairoMusicEngine(createBotMusicOptions(environment));
const music = new MusicService(new KairoMusicClient(engine));
const audit = new AuditLog();
const registry = createCommandRegistry(music, audit);
const developerIds = new Set(developerIdsFromEnvironment(environment));
const router = new InteractionRouter(registry, audit, developerIds);
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
const rest = new REST({ version: '10' }).setToken(environment.DISCORD_TOKEN);

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
  await engine.shutdown();
  client.destroy();
}
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await client.login(environment.DISCORD_TOKEN);
