import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type MessageEditOptions,
} from 'discord.js';
import { guild, query } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { infoCard } from './formatTrack.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show song metadata without playing')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Song name or supported track URL')
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('searchs')
        .setDescription('Number of results to browse (default: 1)')
        .setMinValue(1)
        .setMaxValue(25),
    ),
  usage: '/info <query> [searchs]',
  category: 'Utility',
  async execute(interaction, context) {
    await interaction.deferReply();
    const count = interaction.options.getInteger('searchs') ?? 1;
    const input = query(interaction);
    const guildId = guild(interaction);
    const tracks =
      count === 1
        ? [await context.music.info(input, guildId, interaction.user.id)]
        : await context.music.infoResults(
            input,
            guildId,
            interaction.user.id,
            count,
          );
    let index = 0;
    let active = true;
    const prefix = `kairo:info:${interaction.id}`;
    const render = (expired = false): MessageEditOptions => ({
      components: [
        infoCard(tracks[index]!),
        ...(tracks.length > 1
          ? [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`${prefix}:previous`)
                  .setLabel('Previous')
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(expired || index === 0),
                new ButtonBuilder()
                  .setCustomId(`${prefix}:page`)
                  .setLabel(`Result ${index + 1}/${tracks.length}`)
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(true),
                new ButtonBuilder()
                  .setCustomId(`${prefix}:next`)
                  .setLabel('Next')
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(expired || index === tracks.length - 1),
              ),
            ]
          : []),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    const message = await interaction.editReply(render());
    if (tracks.length <= 1) return;
    const collector = message.createMessageComponentCollector({
      time: 60_000,
      filter: (i) =>
        active &&
        i.user.id === interaction.user.id &&
        (i.customId === `${prefix}:previous` ||
          i.customId === `${prefix}:next`),
    });
    let pending = Promise.resolve();
    collector.on('collect', (i) => {
      if (!active || i.user.id !== interaction.user.id || !i.isButton()) return;
      pending = pending
        .then(async () => {
          if (!active) return;
          index = Math.max(
            0,
            Math.min(
              tracks.length - 1,
              index + (i.customId === `${prefix}:previous` ? -1 : 1),
            ),
          );
          await i.update(render());
        })
        .catch((error) => context.reportComponentError?.(error));
    });
    collector.on('end', () => {
      active = false;
      void pending
        .then(() => interaction.editReply(render(true)))
        .catch((error) => context.reportComponentError?.(error));
    });
  },
};
export default command;
