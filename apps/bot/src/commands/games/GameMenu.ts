import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
} from 'discord.js';
import {
  GameError,
  requireGame,
  type GameSession,
  type GameView,
} from '@kairo/games';
import type { CommandExecutionContext } from '../types.js';
import { voiceTarget } from '../library/helpers.js';
import { uiText } from '../utility/formatTrack.js';
export function gameCard(view: GameView, closed = false) {
  const prefix = `kairo:game:${view.id}`;
  const done = closed || ['finished', 'abandoned'].includes(view.phase);
  const button = (action: string, label: string, disabled = false) =>
    new ButtonBuilder()
      .setCustomId(`${prefix}:${action}:${view.revision}`)
      .setLabel(label)
      .setStyle(
        action === 'start'
          ? ButtonStyle.Primary
          : action === 'end'
            ? ButtonStyle.Danger
            : ButtonStyle.Secondary,
      )
      .setDisabled(done || disabled);
  const details = [
    `## Kairo ${view.kind === 'musictrivia' ? 'Music Trivia' : view.kind.toUpperCase()}`,
    `**${view.phase}** | Round ${view.round || '-'} | <t:${Math.floor(view.deadline / 1000)}:R>`,
    `Players: ${view.players.map((p) => `<@${p}>`).join(', ')} | Spectators: ${view.spectators.length}`,
    ...(view.table
      ? [
          `Table: ${view.table} | Turn: <@${view.turn}>`,
          `Hands: ${Object.entries(view.counts ?? {})
            .map(([p, n]) => `<@${p}> ${n}`)
            .join(' / ')}`,
        ]
      : []),
    ...(view.maskedWord
      ? [`Puzzle: ${view.maskedWord}`, `Mistakes: ${view.mistakes}/6`]
      : []),
    ...(view.reveal ? [`**Round reveal:** ${uiText(view.reveal, 700)}`] : []),
    `Scores: ${Object.entries(view.scores)
      .map(([p, n]) => `<@${p}> ${n}`)
      .join(' | ')}`,
    ...(view.winners.length
      ? [`Winners: ${view.winners.map((p) => `<@${p}>`).join(', ')}`]
      : []),
    '-# Spectators may watch but cannot score. Answers/hands/choices stay private until allowed.',
  ];
  const actions =
    view.phase === 'lobby'
      ? [
          button('join', 'Join'),
          button('start', 'Start'),
          button('spectate', 'Spectate'),
        ]
      : view.kind === 'rps'
        ? [
            button('rock', 'Rock', view.phase !== 'active'),
            button('paper', 'Paper', view.phase !== 'active'),
            button('scissors', 'Scissors', view.phase !== 'active'),
            button('spectate', 'Spectate'),
          ]
        : view.kind === 'uno'
          ? [
              button('hand', 'My hand'),
              button('card', 'Play card', view.phase !== 'active'),
              button('draw', 'Draw', view.phase !== 'active'),
              button('spectate', 'Spectate'),
            ]
          : [
              button('guess', 'Guess', view.phase !== 'active'),
              button('spectate', 'Spectate'),
            ];
  return {
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: { parse: [] as [] },
    components: [
      new ContainerBuilder()
        .setAccentColor(done ? 0x58616e : 0x7c5cff)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(details.join('\n')),
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(...actions),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button('refresh', 'Refresh'),
            button('end', 'End game'),
          ),
        ),
    ],
  };
}
type MenuInteraction = Pick<
  ChatInputCommandInteraction,
  'id' | 'guildId' | 'channelId' | 'guild' | 'user' | 'editReply'
>;
export class GameMenu {
  private active = true;
  private edits = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private unsubscribe: (() => void) | undefined;
  constructor(
    private readonly interaction: MenuInteraction,
    private readonly context: CommandExecutionContext,
    private readonly game: GameSession,
  ) {}
  private edit() {
    const work = this.edits.then(() =>
      this.interaction.editReply(gameCard(this.game.view(), !this.active)),
    );
    this.edits = work.then(
      () => {},
      () => {},
    );
    return work;
  }
  async start() {
    const message = await this.edit();
    const collector = message.createMessageComponentCollector({
      time: 900000,
      filter: (i) =>
        this.active &&
        i.guildId === this.interaction.guildId &&
        i.customId.startsWith(`kairo:game:${this.game.options.id}:`),
    });
    collector.on('collect', (i) => {
      void this.act(i)
        .then(() => this.edit())
        .catch((error) => this.failure(error, i));
    });
    const expire = () => {
      this.active = false;
      if (this.timer) clearInterval(this.timer);
      this.unsubscribe?.();
      if (!['finished', 'abandoned'].includes(this.game.view().phase))
        void this.context.games
          ?.stop(this.game, this.game.options.hostId)
          .catch((e) => this.context.reportComponentError?.(e));
      void this.edit().catch((e) => this.context.reportComponentError?.(e));
    };
    collector.on('end', expire);
    this.unsubscribe = this.context.games?.onClose?.(() =>
      collector.stop('shutdown'),
    );
    let ticking = false;
    this.timer = setInterval(() => {
      if (!this.active || ticking) return;
      ticking = true;
      void this.context
        .games!.tick(this.game)
        .then(() => this.edit())
        .then(() => {
          if (['finished', 'abandoned'].includes(this.game.view().phase))
            collector.stop('finished');
        })
        .catch((e) => this.context.reportComponentError?.(e))
        .finally(() => {
          ticking = false;
        });
    }, 5000);
    this.timer.unref();
  }
  private async act(i: MessageComponentInteraction) {
    requireGame(
      this.active && i.guildId === this.game.options.guildId,
      'GAME_STALE',
      'This game has expired.',
    );
    const [action, token, extra] = i.customId
      .slice(`kairo:game:${this.game.options.id}:`.length)
      .split(':');
    requireGame(
      !extra &&
        !!action &&
        [
          'join',
          'start',
          'spectate',
          'end',
          'refresh',
          'hand',
          'card',
          'draw',
          'guess',
          'rock',
          'paper',
          'scissors',
        ].includes(action),
      'GAME_INVALID',
      'Unknown game control.',
    );
    const revision = Number(token);
    requireGame(Number.isInteger(revision), 'GAME_STALE', 'Refresh the game.');
    const games = this.context.games!;
    if (action === 'hand') {
      const hand = this.game.hand(i.user.id);
      await i.reply({
        content:
          hand
            .map((c) => `${c.id}: ${c.color} ${c.value}`)
            .join('\n')
            .slice(0, 1800) || 'No cards.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (action === 'guess' || action === 'card') {
      requireGame(
        this.game.view().players.includes(i.user.id) &&
          this.game.view().phase === 'active' &&
          revision === this.game.view().revision,
        'GAME_FORBIDDEN',
        'Only current players can act in this round.',
      );
      const id = `kairo:game:${this.game.options.id}:input:${revision}:${i.id}`;
      const modal = new ModalBuilder()
        .setCustomId(id)
        .setTitle(
          action === 'card'
            ? 'Play a card from your private hand'
            : 'Submit your guess',
        );
      const input = (key: string, label: string, required = true) =>
        new LabelBuilder()
          .setLabel(label)
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId(key)
              .setStyle(TextInputStyle.Short)
              .setRequired(required)
              .setMaxLength(200),
          );
      modal.addLabelComponents(
        input(
          'answer',
          action === 'card'
            ? 'Card ID (use My hand)'
            : this.game.options.answerMode === 'artist'
              ? 'Artist'
              : 'Song title / Hangman letter or word',
        ),
      );
      if (action === 'card')
        modal.addLabelComponents(
          input('color', 'Wild color: red/yellow/green/blue', false),
          input('uno', 'Declare UNO: yes', false),
        );
      else if (
        this.game.options.kind === 'musictrivia' &&
        this.game.options.answerMode === 'both'
      )
        modal.addLabelComponents(input('artist', 'Artist'));
      await i.showModal(modal);
      const submitted = await i
        .awaitModalSubmit({
          time: Math.max(
            1,
            Math.min(60000, this.game.view().deadline - Date.now()),
          ),
          filter: (m) => m.user.id === i.user.id && m.customId === id,
        })
        .catch(() => undefined);
      if (!submitted) return;
      await submitted.deferReply({ flags: MessageFlags.Ephemeral });
      if (!this.active) {
        await submitted.editReply({ content: 'This game has expired.' });
        return;
      }
      try {
        const value = submitted.fields.getTextInputValue('answer').trim();
        await games.act(
          this.game,
          i.user.id,
          action === 'card'
            ? {
                type: 'card',
                cardId: value,
                color: submitted.fields
                  .getTextInputValue('color')
                  .toLowerCase()
                  .trim(),
                uno:
                  submitted.fields
                    .getTextInputValue('uno')
                    .toLowerCase()
                    .trim() === 'yes',
              }
            : {
                type: 'guess',
                text: value,
                ...(this.game.options.answerMode === 'both'
                  ? { artist: submitted.fields.getTextInputValue('artist') }
                  : {}),
              },
          revision,
        );
        await submitted.editReply({
          content:
            action === 'guess'
              ? 'Guess received. Results appear after the round closes.'
              : 'Card played.',
        });
      } catch (e) {
        this.context.reportComponentError?.(e, i.user.id);
        await submitted.editReply({
          content:
            this.context.componentErrorMessage?.(e) ??
            'The game action could not be completed.',
        });
      }
      return;
    }
    await i.deferUpdate();
    if (action === 'join') this.game.join(i.user.id);
    else if (action === 'spectate') this.game.spectate(i.user.id);
    else if (action === 'start')
      await games.start(
        this.game,
        i.user.id,
        this.game.options.kind === 'musictrivia'
          ? voiceTarget(i, this.context)
          : undefined,
      );
    else if (action === 'end') await games.stop(this.game, i.user.id);
    else if (action === 'draw')
      await games.act(this.game, i.user.id, { type: 'draw' }, revision);
    else if (action === 'rock' || action === 'paper' || action === 'scissors')
      await games.act(
        this.game,
        i.user.id,
        { type: 'rps', choice: action },
        revision,
      );
    else await games.tick(this.game);
    this.context.audit?.record({
      command: `game:${action}`,
      guildId: this.game.options.guildId,
      userId: i.user.id,
      timestamp: new Date().toISOString(),
      success: true,
      durationMs: 0,
    });
  }
  private async failure(error: unknown, i: MessageComponentInteraction) {
    this.context.reportComponentError?.(error, i.user.id);
    const response = {
      content:
        error instanceof GameError
          ? error.message
          : (this.context.componentErrorMessage?.(error) ??
            'Game action failed.'),
      flags: MessageFlags.Ephemeral as const,
    };
    try {
      if (i.deferred || i.replied) await i.followUp(response);
      else await i.reply(response);
    } catch (e) {
      this.context.reportComponentError?.(e, i.user.id);
    }
  }
}
