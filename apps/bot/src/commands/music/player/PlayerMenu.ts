import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { CommandError } from '../../../errors.js';
import { library, voiceTarget } from '../../library/helpers.js';
import type { CommandExecutionContext } from '../../types.js';
import {
  playerView,
  type PlayerData,
  type PlayerViewState,
} from './playerView.js';

const actions = new Set([
  'previous',
  'pause',
  'resume',
  'skip',
  'shuffle',
  'stop',
  'like',
  'add',
  'refresh',
  'close',
  'queue-prev',
  'queue-next',
]);
const trackActions = new Set([
  'previous',
  'pause',
  'resume',
  'skip',
  'stop',
  'like',
]);
/** Message-local UI only. All playback and library state lives in services. */
export class PlayerMenu {
  private readonly prefix: string;
  private readonly deadline = Date.now() + 300_000;
  private readonly state: PlayerViewState = {
    page: 1,
    active: true,
    busy: false,
    liked: new Set(),
  };
  private readonly liked = new Set<string>();
  private data!: PlayerData;
  private edits = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly interaction: ChatInputCommandInteraction,
    private readonly context: CommandExecutionContext,
  ) {
    this.prefix = `kairo:player:${interaction.id}`;
    this.state.liked = this.liked;
  }
  private load() {
    const guildId = this.interaction.guildId!;
    this.data = {
      queue: this.context.music.queue(guildId),
      playback: this.context.music.playback(guildId),
    };
    this.state.page = Math.max(
      1,
      Math.min(
        this.state.page,
        Math.max(1, Math.ceil(this.data.queue.upcoming.length / 10)),
      ),
    );
  }
  private render(busy = this.state.busy) {
    return playerView(
      this.data,
      { ...this.state, busy },
      this.prefix,
      Boolean(this.context.library),
    );
  }
  private edit(busy = this.state.busy) {
    // Render when the edit is admitted so a queued update cannot reopen expired controls.
    const work = this.edits.then(() =>
      this.interaction.editReply(this.render(busy)),
    );
    this.edits = work.then(
      () => {},
      () => {},
    );
    return work;
  }
  private action(id: string): { name: string; generation: number } | undefined {
    if (!id.startsWith(`${this.prefix}:`)) return;
    const [name, generation, extra] = id
      .slice(this.prefix.length + 1)
      .split(':');
    if (
      !name ||
      !actions.has(name) ||
      !generation ||
      !/^\d+$/u.test(generation) ||
      extra !== undefined
    )
      return;
    return { name, generation: Number(generation) };
  }
  async start() {
    this.load();
    const message = await this.edit();
    const collector = message.createMessageComponentCollector({
      time: 300_000,
      filter: (i) =>
        this.state.active &&
        i.user.id === this.interaction.user.id &&
        this.action(i.customId) !== undefined,
    });
    collector.on('collect', (i) => {
      if (
        !this.state.active ||
        i.user.id !== this.interaction.user.id ||
        !i.isButton()
      )
        return;
      const action = this.action(i.customId);
      if (!action) return;
      if (action.name === 'close') {
        this.state.active = false;
        clearInterval(this.timer);
        collector.stop('closed');
        void i
          .update(this.render())
          .catch((error) => this.context.reportComponentError?.(error));
        return;
      }
      if (this.state.busy) {
        void i
          .reply({
            content:
              'Another player action is in progress. Try again in a moment.',
            flags: MessageFlags.Ephemeral,
          })
          .catch((error) => this.context.reportComponentError?.(error));
        return;
      }
      this.state.busy = true;
      void this.execute(i, action)
        .catch((error) => this.failure(error, i))
        .finally(async () => {
          try {
            this.load();
            await this.edit(false);
          } catch (error) {
            this.context.reportComponentError?.(error);
          } finally {
            this.state.busy = false;
          }
        });
    });
    collector.on('end', () => {
      this.state.active = false;
      clearInterval(this.timer);
      void this.edit().catch((error) =>
        this.context.reportComponentError?.(error),
      );
    });
    this.timer = setInterval(() => {
      if (!this.state.active || this.state.busy) return;
      this.state.busy = true;
      void (async () => {
        try {
          this.load();
          // Automatic updates keep controls available; busy only guards admission.
          await this.edit(false);
        } catch (error) {
          this.context.reportComponentError?.(error);
          collector.stop('refresh-error');
        } finally {
          this.state.busy = false;
        }
      })();
    }, 10_000);
    this.timer.unref();
  }
  private async execute(
    i: MessageComponentInteraction,
    action: { name: string; generation: number },
  ) {
    if (action.name === 'add') {
      await this.add(i);
      return;
    }
    await i.deferUpdate();
    this.load();
    delete this.state.notice;
    if (
      trackActions.has(action.name) &&
      action.generation !== this.data.queue.generation
    )
      throw new CommandError(
        'STALE_PLAYER',
        'The song changed. Check the refreshed player and try again.',
      );
    const guildId = this.interaction.guildId!;
    if (
      ['previous', 'pause', 'resume', 'skip', 'stop', 'shuffle'].includes(
        action.name,
      )
    )
      voiceTarget(i, this.context);
    if (action.name === 'pause') await this.context.music.pause(guildId);
    else if (action.name === 'resume') await this.context.music.resume(guildId);
    else if (action.name === 'previous')
      await this.context.music.previous(guildId);
    else if (action.name === 'shuffle') {
      await this.context.music.shuffle(guildId);
      this.state.notice = 'Shuffled the upcoming queue.';
    } else if (action.name === 'skip') await this.context.music.skip(guildId);
    else if (action.name === 'stop') await this.context.music.stop(guildId);
    else if (action.name === 'like') {
      const entry = this.data.queue.current;
      if (!entry)
        throw new CommandError(
          'STALE_PLAYER',
          'There is no current song to like.',
        );
      const result = await library(this.context).likeSaved(
        this.interaction.user.id,
        entry.track,
      );
      this.liked.add(entry.id);
      this.state.notice = result.added
        ? 'Saved to your Liked Songs.'
        : 'You already liked this song.';
    } else if (action.name === 'queue-prev') this.state.page--;
    else if (action.name === 'queue-next') this.state.page++;
  }
  private async add(i: MessageComponentInteraction) {
    voiceTarget(i, this.context);
    const id = `${this.prefix}:modal:${i.id}`;
    const modal = new ModalBuilder()
      .setCustomId(id)
      .setTitle('Add a song to the queue')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Song name or supported track URL')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('query')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(500),
          ),
      );
    await i.showModal(modal);
    const response = i
      .awaitModalSubmit({
        time: Math.max(1, Math.min(60_000, this.deadline - Date.now())),
        filter: (s) =>
          s.user.id === this.interaction.user.id && s.customId === id,
      })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await this.edit();
    const result = await response;
    if ('error' in result) {
      if (
        (result.error as { code?: string })?.code ===
        'InteractionCollectorError'
      ) {
        this.state.notice = 'Input timed out. No song was added.';
        return;
      }
      throw result.error;
    }
    const submitted = result.value;
    if (!this.state.active || Date.now() >= this.deadline) {
      await submitted.reply({
        content: 'This player has expired. Run /player again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await submitted.deferUpdate();
    try {
      const target = voiceTarget(submitted, this.context);
      const outcome = await this.context.music.play({
        guildId: target.guildId,
        userId: this.interaction.user.id,
        query: submitted.fields.getTextInputValue('query').trim(),
        voiceTarget: target,
      });
      await this.context.onVoiceActivity?.(target.guildId);
      this.state.notice =
        outcome.position === 0
          ? `Playing: ${outcome.track.title}`
          : `Queued: ${outcome.track.title}`;
    } catch (error) {
      await this.failure(error, submitted);
    }
  }
  private async failure(
    error: unknown,
    i: MessageComponentInteraction | ModalSubmitInteraction,
  ) {
    this.context.reportComponentError?.(error);
    const response = {
      content:
        this.context.componentErrorMessage?.(error) ??
        'The player action could not be completed.',
      flags: MessageFlags.Ephemeral as const,
      allowedMentions: { parse: [] },
    };
    try {
      if (i.deferred || i.replied) await i.followUp(response);
      else await i.reply(response);
    } catch (responseError) {
      this.context.reportComponentError?.(responseError);
    }
  }
}
