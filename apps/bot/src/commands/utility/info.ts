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
import { library } from '../library/helpers.js';
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
  nicknames: ['search'],
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
    const liked = new Set<number>();
    const prefix = `kairo:info:${interaction.id}`;
    const render = (expired = false): MessageEditOptions => ({
      components: [
        infoCard(tracks[index]!),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${prefix}:like:${index}`)
            .setLabel(liked.has(index) ? 'Liked' : 'Like song')
            .setStyle(ButtonStyle.Success)
            .setDisabled(expired || liked.has(index) || !context.library),
        ),
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
    if (tracks.length <= 1 && !context.library) return;
    const collector = message.createMessageComponentCollector({
      time: 60_000,
      filter: (i) =>
        active &&
        i.user.id === interaction.user.id &&
        (i.customId === `${prefix}:previous` ||
          i.customId === `${prefix}:next` ||
          (Boolean(context.library) &&
            i.customId === `${prefix}:like:${index}`)),
    });
    let pending = Promise.resolve();
    collector.on('collect', (i) => {
      if (!active || i.user.id !== interaction.user.id || !i.isButton()) return;
      const selectedIndex = index;
      const isLike = i.customId === `${prefix}:like:${selectedIndex}`;
      if (
        !isLike &&
        i.customId !== `${prefix}:previous` &&
        i.customId !== `${prefix}:next`
      )
        return;
      // Acknowledge persistence actions immediately, before serialized DB work.
      const acknowledgement = isLike
        ? Promise.resolve(i.deferUpdate())
        : Promise.resolve();
      void acknowledgement.catch(() => {});
      pending = pending
        .then(async () => {
          await acknowledgement;
          if (!active) return;
          if (isLike) {
            if (liked.has(selectedIndex)) return;
            try {
              const result = await library(context).likeSaved(
                interaction.user.id,
                tracks[selectedIndex]!,
              );
              liked.add(selectedIndex);
              await i.editReply(render(!active));
              await i.followUp({
                content: result.added
                  ? 'Liked: saved to your Liked Songs.'
                  : 'You already liked this song.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
              });
            } catch (error) {
              context.reportComponentError?.(error);
              await i.followUp({
                content:
                  context.componentErrorMessage?.(error) ??
                  'The song could not be saved.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
              });
            }
            return;
          }
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
