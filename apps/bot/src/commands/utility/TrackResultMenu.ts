import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageEditOptions,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Track } from '@kairo/music-engine';
import { CommandError } from '../../errors.js';
import type { CommandExecutionContext } from '../types.js';
import { infoCard } from './formatTrack.js';
import { library, voiceTarget } from '../library/helpers.js';
export async function showTrackResults(
  interaction: ChatInputCommandInteraction,
  context: CommandExecutionContext,
  tracks: Track[],
) {
  if (!tracks.length)
    throw new CommandError(
      'RECOMMENDATION_UNAVAILABLE',
      'No matching metadata results were found.',
    );
  let index = 0;
  let active = true;
  const liked = new Set<number>();
  const prefix = `kairo:info:${interaction.id}`;
  const playbackAvailable = typeof context.music.playTracks === 'function';
  const allowedActions = ['like', 'play', 'play-next', 'add', 'save'];
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
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...[
          ['play', 'Play'],
          ['play-next', 'Play next'],
          ['add', 'Add to queue'],
          ['save', 'Add to playlist'],
        ].map(([action, label]) =>
          new ButtonBuilder()
            .setCustomId(`${prefix}:${action}:${index}`)
            .setLabel(label!)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(
              expired ||
                (action === 'save' ? !context.library : !playbackAvailable),
            ),
        ),
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
  if (
    !message?.createMessageComponentCollector ||
    (tracks.length <= 1 && !context.library && !playbackAvailable)
  )
    return;
  const collector = message.createMessageComponentCollector({
    time: 60_000,
    filter: (i) =>
      active &&
      i.user.id === interaction.user.id &&
      (i.customId === `${prefix}:previous` ||
        i.customId === `${prefix}:next` ||
        allowedActions.some(
          (action) => i.customId === `${prefix}:${action}:${index}`,
        )),
  });
  let pending = Promise.resolve();
  collector.on('collect', (i) => {
    if (!active || i.user.id !== interaction.user.id || !i.isButton()) return;
    const selectedIndex = index;
    const action = allowedActions.find(
      (a) => i.customId === `${prefix}:${a}:${selectedIndex}`,
    );
    const isLike = i.customId === `${prefix}:like:${selectedIndex}`;
    if (
      !action &&
      i.customId !== `${prefix}:previous` &&
      i.customId !== `${prefix}:next`
    )
      return;
    // Acknowledge persistence actions immediately, before serialized DB work.
    const acknowledgement =
      action && action !== 'save'
        ? Promise.resolve(i.deferUpdate())
        : Promise.resolve();
    void acknowledgement.catch(() => {});
    pending = pending
      .then(async () => {
        await acknowledgement;
        if (!active) return;
        if (action === 'save') {
          const id = `${prefix}:playlist:${selectedIndex}:${i.id}`;
          await i.showModal(
            new ModalBuilder()
              .setCustomId(id)
              .setTitle('Add song to playlist')
              .addLabelComponents(
                new LabelBuilder()
                  .setLabel('Your playlist name')
                  .setTextInputComponent(
                    new TextInputBuilder()
                      .setCustomId('name')
                      .setStyle(TextInputStyle.Short)
                      .setRequired(true)
                      .setMaxLength(64),
                  ),
              ),
          );
          const submit = await i
            .awaitModalSubmit({
              time: 60000,
              filter: (modal) =>
                modal.user.id === interaction.user.id && modal.customId === id,
            })
            .catch(() => undefined);
          if (!submit) return;
          if (!active) {
            await submit.reply({
              content: 'This search has expired. Run /search again.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          await submit.deferReply({ flags: MessageFlags.Ephemeral });
          try {
            const result = await library(context).addSaved(
              interaction.user.id,
              submit.fields.getTextInputValue('name'),
              tracks[selectedIndex]!,
            );
            await submit.editReply({
              content: result.added
                ? 'Added to your playlist.'
                : 'This song is already in the playlist.',
            });
          } catch (error) {
            context.reportComponentError?.(error);
            await submit.editReply({
              content:
                context.componentErrorMessage?.(error) ??
                'The playlist could not be updated.',
            });
          }
          return;
        }
        if (action && !isLike) {
          try {
            const target = voiceTarget(i, context);
            const selected = tracks[selectedIndex]!;
            await context.music.playTracks({
              guildId: target.guildId,
              userId: i.user.id,
              voiceTarget: target,
              tracks: [selected],
              ...(action === 'play-next' ? { position: 'next' as const } : {}),
            });
            await context.onVoiceActivity?.(target.guildId);
            await i.followUp({
              content:
                action === 'play-next'
                  ? 'Queued to play next.'
                  : 'Added to the queue; playback starts if idle.',
              flags: MessageFlags.Ephemeral,
              allowedMentions: { parse: [] },
            });
          } catch (error) {
            context.reportComponentError?.(error);
            await i.followUp({
              content:
                context.componentErrorMessage?.(error) ??
                'The song could not be queued.',
              flags: MessageFlags.Ephemeral,
            });
          }
          return;
        }
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
}
