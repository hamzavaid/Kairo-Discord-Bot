import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { CommandError } from '../../errors.js';
import { uiText, duration } from '../utility/formatTrack.js';
import type { SlashCommand } from '../types.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Browse your retained listening history')
    .addIntegerOption((o) =>
      o
        .setName('page')
        .setDescription('Page number')
        .setMinValue(1)
        .setMaxValue(1000),
    ),
  category: 'Music',
  usage: '/history [page]',
  async execute(i, c) {
    if (!c.history)
      throw new CommandError(
        'HISTORY_EMPTY',
        'Listening history is unavailable.',
      );
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const service = c.history;
    let page = i.options.getInteger('page') ?? 1;
    let active = true;
    let busy = false;
    const scope = { userId: i.user.id };
    let rows = await service.list(scope, page, 10);
    if (!rows.length) {
      await i.editReply({ content: 'No listening history on this page.' });
      return;
    }
    let hasNext =
      page < 1000 && (await service.list(scope, page + 1, 10)).length > 0;
    const prefix = `kairo:history:${i.id}`;
    const render = () => ({
      content: [
        '## Your listening history',
        ...rows.map(
          (r, n) =>
            `${(page - 1) * 10 + n + 1}. ${uiText(r.track.title, 70)} - ${uiText(r.track.artists.map((a) => a.name).join(', '), 50)} | ${r.status} | ${duration(r.listenedMs)} | <t:${Math.floor(r.requestedAt.getTime() / 1000)}:d>`,
        ),
        `Page ${page} | Retained for 180 days`,
      ].join('\n'),
      allowedMentions: { parse: [] as [] },
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...['previous', 'next'].map((action, n) =>
            new ButtonBuilder()
              .setCustomId(`${prefix}:${action}`)
              .setLabel(n ? 'Next' : 'Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(
                !active || (n ? !hasNext || page >= 1000 : page === 1),
              ),
          ),
        ),
      ],
    });
    const message = await i.editReply(render());
    const collector = message.createMessageComponentCollector({
      time: 60000,
      filter: (b) =>
        active &&
        b.user.id === i.user.id &&
        [`${prefix}:previous`, `${prefix}:next`].includes(b.customId),
    });
    collector.on('collect', (b) => {
      if (!active || busy || b.user.id !== i.user.id || !b.isButton()) return;
      busy = true;
      void (async () => {
        await b.deferUpdate();
        const target = Math.max(
          1,
          Math.min(1000, page + (b.customId.endsWith(':next') ? 1 : -1)),
        );
        const nextRows = await service.list(scope, target, 10);
        if (nextRows.length) {
          page = target;
          rows = nextRows;
        }
        hasNext =
          page < 1000 && (await service.list(scope, page + 1, 10)).length > 0;
        await b.editReply(render());
      })()
        .catch((e) => c.reportComponentError?.(e))
        .finally(() => {
          busy = false;
          if (!active)
            void i
              .editReply(render())
              .catch((e) => c.reportComponentError?.(e));
        });
    });
    collector.on('end', () => {
      active = false;
      void i.editReply(render()).catch((e) => c.reportComponentError?.(e));
    });
  },
};
export default command;
