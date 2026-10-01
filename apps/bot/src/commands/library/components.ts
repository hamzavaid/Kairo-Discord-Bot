import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type MessageEditOptions,
} from 'discord.js';
import { LibraryError } from '@kairo/data';
import { libraryPage } from '../../services/LibraryService.js';
import type { CommandExecutionContext } from '../types.js';
const mentions = { parse: [] as [] };
function buttons(
  id: string,
  labels: [string, string],
  disabled: [boolean, boolean],
) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...labels.map((label, index) =>
      new ButtonBuilder()
        .setCustomId(`${id}:${index}`)
        .setLabel(label)
        .setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled[index]!),
    ),
  );
}
async function report(
  error: unknown,
  interaction: ButtonInteraction,
  context: CommandExecutionContext,
) {
  context.reportComponentError?.(error);
  try {
    await interaction.followUp({
      content:
        error instanceof LibraryError
          ? error.message
          : 'The library action could not be completed.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: mentions,
    });
  } catch (responseError) {
    context.reportComponentError?.(responseError);
  }
}
/** Only the returned message owns these controls; callbacks never share state across users. */
export async function pages(
  interaction: ChatInputCommandInteraction,
  context: CommandExecutionContext,
  title: string,
  lines: string[],
  initial = 1,
) {
  let current = libraryPage(lines, initial);
  let active = true;
  const id = `kairo:library:page:${interaction.id}`;
  const render = (expired = false): MessageEditOptions => ({
    content: [
      title,
      ...current.items,
      `Page ${current.page}/${current.pages} · ${current.total} items`,
    ].join('\n'),
    allowedMentions: mentions,
    components:
      current.pages > 1
        ? [
            buttons(
              id,
              ['Previous', 'Next'],
              [
                expired || current.page === 1,
                expired || current.page === current.pages,
              ],
            ),
          ]
        : [],
  });
  const message = await interaction.editReply(render());
  if (current.pages <= 1) return;
  const collector = message.createMessageComponentCollector({
    time: 60_000,
    filter: (i) =>
      active &&
      i.user.id === interaction.user.id &&
      (i.customId === `${id}:0` || i.customId === `${id}:1`),
  });
  let pending = Promise.resolve();
  collector.on('collect', (i) => {
    pending = pending
      .then(async () => {
        if (!active || i.user.id !== interaction.user.id || !i.isButton())
          return;
        const next = Math.min(
          current.pages,
          Math.max(1, current.page + (i.customId === `${id}:0` ? -1 : 1)),
        );
        current = libraryPage(lines, next);
        await i.update(render());
      })
      .catch((error) => report(error, i as ButtonInteraction, context));
  });
  collector.on('end', () => {
    active = false;
    void pending
      .then(() => interaction.editReply(render(true)))
      .catch((error) => context.reportComponentError?.(error));
  });
}
export async function confirm(
  interaction: ChatInputCommandInteraction,
  context: CommandExecutionContext,
  prompt: string,
  action: () => Promise<string>,
) {
  const id = `kairo:library:confirm:${interaction.id}`;
  let settled = false;
  const row = () => buttons(id, ['Confirm', 'Cancel'], [settled, settled]);
  const message = await interaction.editReply({
    content: prompt,
    components: [row()],
    allowedMentions: mentions,
  });
  const collector = message.createMessageComponentCollector({
    time: 60_000,
    filter: (i) =>
      !settled &&
      i.user.id === interaction.user.id &&
      (i.customId === `${id}:0` || i.customId === `${id}:1`),
  });
  collector.on('collect', (i) => {
    if (settled || i.user.id !== interaction.user.id || !i.isButton()) return;
    settled = true;
    collector.stop('answered');
    void (async () => {
      await i.update({
        content:
          i.customId === `${id}:0` ? 'Updating your library…' : 'Cancelled.',
        components: [row()],
        allowedMentions: mentions,
      });
      if (i.customId === `${id}:0`)
        await interaction.editReply({
          content: await action(),
          components: [],
          allowedMentions: mentions,
        });
    })().catch((error) => report(error, i, context));
  });
  collector.on('end', () => {
    if (settled) return;
    settled = true;
    void interaction
      .editReply({
        content: 'Confirmation expired. Run the command again to retry.',
        components: [row()],
        allowedMentions: mentions,
      })
      .catch((error) => context.reportComponentError?.(error));
  });
}
