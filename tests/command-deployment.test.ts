import { expect, it, vi } from 'vitest';
import { Routes } from 'discord.js';
import {
  deployGlobalCommands,
  deploymentCredentials,
} from '../apps/bot/src/deploy-commands.js';
import { commandRegistrationData } from '../apps/bot/src/commands/slashCommandHandler.js';

it('deploys the complete handler definitions and nicknames to the global route', async () => {
  const put = vi.fn(async () => []);
  const clientId = '123456789012345678';
  const count = await deployGlobalCommands({ put }, clientId);
  expect(put).toHaveBeenCalledOnce();
  expect(put).toHaveBeenCalledWith(Routes.applicationCommands(clientId), {
    body: commandRegistrationData(),
  });
  const body = put.mock.calls[0] as unknown as [
    string,
    { body: { name: string; options?: unknown }[] },
  ];
  expect(body[0]).not.toContain('/guilds/');
  const commands = body[1].body;
  expect(count).toBe(commands.length);
  expect(commands.find((c) => c.name === 'search')?.options).toEqual(
    commands.find((c) => c.name === 'info')?.options,
  );
  expect(commands.some((c) => c.name === 'playlist')).toBe(true);
});
it('requires only deployment credentials and ignores development guild and database settings', () => {
  expect(
    deploymentCredentials({
      DISCORD_TOKEN: 'fixture-token',
      DISCORD_CLIENT_ID: '123456789012345678',
      DISCORD_DEV_GUILD_ID: 'invalid',
    }),
  ).toEqual({ token: 'fixture-token', clientId: '123456789012345678' });
  expect(() => deploymentCredentials({})).toThrow('DISCORD_TOKEN is required');
  expect(() =>
    deploymentCredentials({
      DISCORD_TOKEN: 'secret',
      DISCORD_CLIENT_ID: 'bad',
    }),
  ).toThrow('DISCORD_CLIENT_ID must be a valid application ID');
});
it('does not swallow transport failures or expose credentials in validation errors', async () => {
  const failure = new Error('transport failed');
  await expect(
    deployGlobalCommands(
      { put: vi.fn().mockRejectedValue(failure) },
      '123456789012345678',
    ),
  ).rejects.toBe(failure);
  const put = vi.fn();
  await expect(deployGlobalCommands({ put }, 'bad')).rejects.toThrow(
    'DISCORD_CLIENT_ID must be a valid application ID',
  );
  expect(put).not.toHaveBeenCalled();
});
