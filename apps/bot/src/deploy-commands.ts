import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import {
  commandRegistrationData,
  type CommandRegistrationTransport,
} from './commands/slashCommandHandler.js';

class CommandDeploymentError extends Error {}
function validateClientId(clientId?: string): asserts clientId is string {
  if (!clientId || !/^\d{17,20}$/u.test(clientId))
    throw new CommandDeploymentError(
      'DISCORD_CLIENT_ID must be a valid application ID.',
    );
}

/** Deployment does not need MongoDB, voice, metadata credentials or a dev guild. */
export function deploymentCredentials(environment: NodeJS.ProcessEnv): {
  token: string;
  clientId: string;
} {
  const token = environment.DISCORD_TOKEN?.trim();
  if (!token) throw new CommandDeploymentError('DISCORD_TOKEN is required.');
  const clientId = environment.DISCORD_CLIENT_ID?.trim();
  validateClientId(clientId);
  return { token, clientId };
}

/** Bulk replace global definitions using the handler's canonical command list. */
export async function deployGlobalCommands(
  transport: CommandRegistrationTransport,
  clientId: string,
): Promise<number> {
  validateClientId(clientId);
  const body = commandRegistrationData();
  await transport.put(Routes.applicationCommands(clientId), { body });
  return body.length;
}

async function main(): Promise<void> {
  try {
    if (existsSync('.env')) process.loadEnvFile('.env');
    const { token, clientId } = deploymentCredentials(process.env);
    const rest = new REST({ version: '10', timeout: 15_000 }).setToken(token);
    const count = await deployGlobalCommands(rest, clientId);
    console.log(
      `Registered ${count} global slash commands for application ${clientId}.`,
    );
  } catch (error) {
    console.error(
      error instanceof CommandDeploymentError
        ? error.message
        : 'Global command registration failed. Check Discord credentials, network access and application permissions.',
    );
    // Log only stable transport diagnostics, not request bodies or credentials.
    if (error && typeof error === 'object') {
      const diagnostics: Record<string, number> = {};
      for (const key of ['code', 'status']) {
        const value = Reflect.get(error, key) as unknown;
        if (typeof value === 'number') diagnostics[key] = value;
      }
      if (Object.keys(diagnostics).length) console.error(diagnostics);
    }
    process.exitCode = 1;
  }
}

// Importing the deployment helpers in offline tests must not publish commands.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
