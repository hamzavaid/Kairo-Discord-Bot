import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createSlashCommandHandler } from '../apps/bot/src/commands/slashCommandHandler.js';
import help from '../apps/bot/src/commands/utility/help.js';
it('registers all advanced commands and renders them through existing help categories', async () => {
  const handler = createSlashCommandHandler({
    music: {},
    settings: {},
    audit: {},
    developerIds: new Set(),
  } as never);
  const data = handler.registrationData();
  const expected = [
    'autoplay',
    'volume',
    'repeat',
    'filter',
    'vote',
    'history',
    'stats',
    'top',
    'recommend',
    'lyrics',
    'discover',
  ];
  for (const name of expected)
    expect(data).toContainEqual(expect.objectContaining({ name }));
  expect(handler.get('search')).toBe(handler.get('info'));
  const collector = new EventEmitter();
  await help.execute(
    {
      user: { id: 'u' },
      reply: async () => ({
        resource: {
          message: { createMessageComponentCollector: () => collector },
        },
      }),
    } as never,
    { commands: handler.commands, isDeveloper: false } as never,
  );
  for (const category of ['Music', 'Utility']) {
    const update = vi.fn();
    collector.emit('collect', {
      user: { id: 'u' },
      customId: 'help-category',
      values: [category],
      isStringSelectMenu: () => true,
      update,
    });
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
    const text = JSON.stringify(update.mock.calls);
    for (const command of handler.list().filter((c) => c.category === category))
      expect(text).toContain(command.usage);
    expect(text).not.toContain('/auditlog');
  }
});
