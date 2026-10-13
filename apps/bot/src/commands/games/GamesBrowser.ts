import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { GAME_KINDS, GameError } from '@kairo/games';
import type { CommandExecutionContext } from '../types.js';
import { GameMenu } from './GameMenu.js';
type BrowserInteraction = Pick<
  ChatInputCommandInteraction,
  'id' | 'guildId' | 'channelId' | 'user' | 'editReply'
>;
export async function gamesBrowser(
  i: BrowserInteraction,
  c: CommandExecutionContext,
  invitedUserId?: string,
) {
  const prefix = `kairo:games:${i.id}`;
  let active = true;
  let busy = false;
  const render = () => ({
    flags: MessageFlags.IsComponentsV2 as const,
    components: [
      new ContainerBuilder()
        .setAccentColor(0x7c5cff)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Kairo Games\nOpen a lobby. Everyone can spectate; only joined players can score.${invitedUserId ? `\nInvite reserved for <@${invitedUserId}> in RPS.` : ''}\nUse /musictrivia for sources/rounds/modes, /uno for house rules, and /games stats or leaderboard for persistent results.`,
          ),
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...GAME_KINDS.map((kind) =>
              new ButtonBuilder()
                .setCustomId(`${prefix}:${kind}`)
                .setLabel(
                  kind === 'musictrivia' ? 'Music Trivia' : kind.toUpperCase(),
                )
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!active || busy),
            ),
          ),
        ),
    ],
    allowedMentions: { parse: [] as [] },
  });
  const message = await i.editReply(render());
  const collector = message.createMessageComponentCollector({
    time: 60000,
    filter: (b) =>
      active &&
      b.user.id === i.user.id &&
      GAME_KINDS.some((k) => b.customId === `${prefix}:${k}`),
  });
  collector.on('collect', (b) => {
    if (!active || busy || b.user.id !== i.user.id) return;
    busy = true;
    void (async () => {
      await b.deferReply();
      if (!i.guildId || !c.games)
        throw new GameError('GAME_INVALID', 'Games are unavailable.');
      const kind = GAME_KINDS.find((k) => b.customId === `${prefix}:${k}`)!;
      const game = await c.games.create({
        guildId: i.guildId,
        channelId: i.channelId,
        hostId: i.user.id,
        kind,
        ...(invitedUserId ? { invitedUserId } : {}),
      });
      await new GameMenu(b, c, game).start();
    })()
      .catch(async (e) => {
        c.reportComponentError?.(e, b.user.id);
        await b
          .editReply({
            content:
              c.componentErrorMessage?.(e) ?? 'Could not create the lobby.',
          })
          .catch((err) => c.reportComponentError?.(err));
      })
      .finally(() => {
        busy = false;
        void i.editReply(render()).catch((e) => c.reportComponentError?.(e));
      });
  });
  collector.on('end', () => {
    active = false;
    void i.editReply(render()).catch((e) => c.reportComponentError?.(e));
  });
}
