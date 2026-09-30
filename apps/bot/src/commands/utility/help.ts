import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type {
  CommandCategory,
  CommandExecutionContext,
  SlashCommand,
} from '../types.js';

function createContainer(
  commands: ReadonlyMap<string, SlashCommand>,
  categories: readonly CommandCategory[],
  isDeveloper: boolean,
): ContainerBuilder {
  const container = new ContainerBuilder();

  for (const [index, category] of categories.entries()) {
    const entries = [...commands.values()].filter(
      (item) =>
        item.category === category && (!item.developerOnly || isDeveloper),
    );
    const content =
      `## ${category}:\n` +
      entries
        .map((item) => `**${item.usage}:** \n-# ${item.data.description}`)
        .join('\n');

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    );
    if (index < categories.length - 1)
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  }

  return container;
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List commands'),
  usage: '/help',
  category: 'Utility',
  async execute(interaction, context: CommandExecutionContext) {
    const categories = ['Music', 'Utility', 'Developer'] as const;
    await interaction.reply({
      components: [
        createContainer(context.commands, categories, context.isDeveloper),
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};

export default command;
