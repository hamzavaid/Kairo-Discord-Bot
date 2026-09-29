import { Routes } from 'discord.js';
import type { ApplicationCommandRegistry } from './registry.js';

export interface CommandRegistrationTransport {
  put(
    route: string,
    options: {
      body: ReturnType<ApplicationCommandRegistry['registrationData']>;
    },
  ): Promise<unknown>;
}

/** Registration is an explicit startup operation, separate from routing. */
export async function registerCommands(
  registry: ApplicationCommandRegistry,
  transport: CommandRegistrationTransport,
  clientId: string,
  devGuildId?: string,
): Promise<void> {
  const route = devGuildId
    ? Routes.applicationGuildCommands(clientId, devGuildId)
    : Routes.applicationCommands(clientId);
  await transport.put(route, { body: registry.registrationData() });
}
