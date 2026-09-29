import type { ApplicationCommandRegistry } from '../registry.js';
import type { CommandDefinition } from '../types.js';

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
        content: categories
          .flatMap((category) => {
            const entries = registry
              .list()
              .filter(
                (item) =>
                  item.category === category &&
                  (!item.developerOnly || context.isDeveloper),
              );
            return entries.length
              ? [
                  `${category}:`,
                  ...entries.map(
                    (item) => `${item.usage} — ${item.description}`,
                  ),
                ]
              : [];
          })
          .join('\n')
          .slice(0, 1900),
        ephemeral: true,
      };
    },
  };
}
