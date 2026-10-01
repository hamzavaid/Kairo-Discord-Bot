import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type {
  CommandCategory,
  CommandExecutionContext,
  SlashCommand,
} from '../types.js';

function createCategorySelectMenu(
  filtered: Array<{ name: string; description: string }>,
): StringSelectMenuBuilder {
  const category_select_menu = new StringSelectMenuBuilder()
    .setCustomId(`help-category`)
    .setPlaceholder('Choose a command category...')
    .addOptions(
      filtered.map((category) => {
        return new StringSelectMenuOptionBuilder()
          .setLabel(category.name)
          .setDescription(category.description)
          .setValue(category.name);
      }),
    );

  return category_select_menu;
}

function createHelpContainer(
  filtered: Array<{ name: string; description: string }>,
): ContainerBuilder {
  const help_main_message = [
    '## Help Command',
    '',
    'Use the menu below to choose a command category.',
    '',
    'Selecting a category will display the available commands, their usage, and a short description of what each command does.',
    '',
    'You can select another category at any time while this help menu is active.',
  ].join('\n');

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(help_main_message),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        createCategorySelectMenu(filtered),
      ),
    );
}

function createCategoryContainer(
  commands: ReadonlyMap<string, SlashCommand>,
  category: CommandCategory,
  isDeveloper: boolean,
): ContainerBuilder {
  const container = new ContainerBuilder();

  const entries = [...commands.values()].filter(
    (command) =>
      command.category === category && (!command.developerOnly || isDeveloper),
  );

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${category} Commands\n\n` +
          entries
            .map(
              (command) =>
                `**${command.usage}**\n` + `-# ${command.data.description}`,
            )
            .join('\n\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('back')
          .setLabel('Back')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return container;
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List commands'),
  usage: '/help',
  category: 'Utility',
  async execute(interaction, context: CommandExecutionContext) {
    const categories = [
      { name: 'Music', description: 'Playback, queue, and voice commands' },
      { name: 'Library', description: 'Persistent playlists and Liked Songs' },
      { name: 'Utility', description: 'General Kairo utility commands' },
      { name: 'Developer', description: 'Developer-only commands' },
    ];
    const filtered = context.isDeveloper
      ? categories
      : categories.filter((item) => item.name !== 'Developer');

    const response = await interaction.reply({
      components: [createHelpContainer(filtered)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      withResponse: true,
    });

    const message = response.resource?.message;

    if (!message) return;

    const collector = message.createMessageComponentCollector({
      time: 60_000,
      filter: (i) =>
        (i.customId === 'help-category' || i.customId === 'back') &&
        i.user.id === interaction.user.id,
    });

    collector.on('collect', async (i) => {
      if (i.isStringSelectMenu() && i.customId === 'help-category') {
        const category = i.values[0] as CommandCategory;

        await i.update({
          components: [
            createCategoryContainer(
              context.commands,
              category,
              context.isDeveloper,
            ),
          ],
        });

        return;
      }

      if (i.isButton() && i.customId === 'back') {
        await i.update({
          components: [createHelpContainer(filtered)],
        });
      }
    });
  },
};

export default command;
