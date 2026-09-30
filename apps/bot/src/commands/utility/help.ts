import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { ApplicationCommandRegistry } from '../registry.js';
import type { CommandContext, CommandDefinition } from '../types.js';

function createContainer(
  registry: ApplicationCommandRegistry,
  categories: readonly ['Music', 'Utility', 'Developer'],
  context: CommandContext,
): ContainerBuilder {
  const container = new ContainerBuilder();
  for (const [index, category] of categories.entries()) {
    const entries = registry
      .list()
      .filter(
        (item) =>
          item.category === category &&
          (!item.developerOnly || context.isDeveloper),
      );
    const content =
      `## ${category}:\n` +
      entries
        .map((item) => `**${item.usage}:** \n-# ${item.description}`)
        .join('\n');
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    );
    if (index < categories.length - 1)
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  }
  return container;
}

export function createHelpCommand(
  registry: ApplicationCommandRegistry,
): CommandDefinition {
  return {
    name: 'help',
    description: 'List commands',
    usage: '/help',
    category: 'Utility',
    async execute(context) {
      const categories = ['Music', 'Utility', 'Developer'] as const;
      return {
        components: [createContainer(registry, categories, context)],
        ephemeral: true,
        flags: MessageFlags.IsComponentsV2,
      };
    },
  };
}
