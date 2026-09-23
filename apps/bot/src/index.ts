import { Client, GatewayIntentBits } from 'discord.js';
import { createLogger, parseEnvironment } from '@kairo/shared';

const environment = parseEnvironment(process.env);
const logger = createLogger(environment.LOG_LEVEL);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () =>
  logger.info({ clientId: client.user?.id }, 'Kairo ready'),
);
client.on('error', (error) =>
  logger.error({ err: error }, 'Discord client error'),
);

await client.login(environment.DISCORD_TOKEN);
