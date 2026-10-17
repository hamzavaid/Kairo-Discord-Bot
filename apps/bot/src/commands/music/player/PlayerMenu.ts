import { parseSeekTimestamp } from '@kairo/music-engine';
import { withOperation } from '@kairo/shared';
import { normalizeGuildControls } from '@kairo/data';
import { lyricsChunks, resolveLyrics } from '../lyrics.js';
import { pages } from '../../library/components.js';
import { showTrackResults } from '../../utility/TrackResultMenu.js';
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
import { playResponse } from '../playResponse.js';
import { CommandError } from '../../../errors.js';
import { library, voiceTarget } from '../../library/helpers.js';
import type { CommandExecutionContext } from '../../types.js';
import {
  playerView,
  type PlayerData,
  type PlayerViewState,
} from './playerView.js';

const actions = new Set([
  'seek',
  'rewind',
  'forward',
  'previous',
  'pause',
  'resume',
  'skip',
  'shuffle',
  'stop',
  'like',
  'add',
  'options',
  'refresh',
  'close',
  'queue-prev',
  'queue-next',
  'repeat',
  'autoplay',
  'volume-down',
  'volume-up',
  'lyrics',
  'filter',
  'discover',
]);
const trackActions = new Set([
  'seek',
  'rewind',
  'forward',
  'previous',
  'pause',
  'resume',
  'skip',
  'stop',
  'like',
  'shuffle',
  'repeat',
  'autoplay',
  'volume-down',
  'volume-up',
  'filter',
  'lyrics',
]);
/** Message-local UI only. All playback and library state lives in services. */
export class PlayerMenu {
  private readonly abort = new AbortController();
  private readonly prefix: string;
  private readonly deadline = Date.now() + 300_000;
  private readonly state: PlayerViewState = {
    page: 1,
    active: true,
    busy: false,
    optionsOpen: false,
    liked: new Set(),
  };
  private readonly liked = new Set<string>();
  private data!: PlayerData;
  private edits = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly interaction: ChatInputCommandInteraction,
    private readonly context: CommandExecutionContext,
    private readonly shared = false,
  ) {
    this.prefix = `kairo:player:${interaction.id}`;
    this.state.liked = this.liked;
  }
  private async load() {
    const guildId = this.interaction.guildId!;
    this.data = {
      queue: this.context.music.queue(guildId),
      playback: this.context.music.playback(guildId),
      autoplay: normalizeGuildControls(
        (await this.context.settings?.get(guildId))?.controls,
      ).autoplay,
      shared: this.shared,
      lyricsAvailable: Boolean(this.context.lyrics),
      discoveryAvailable: Boolean(this.context.recommendations),
    };
    this.state.page = Math.max(
      1,
      Math.min(
        this.state.page,
        Math.max(1, Math.ceil(this.data.queue.upcoming.length / 10)),
      ),
    );
    if (!this.shared) {
      this.liked.clear();
      const current = this.data.queue.current;
      if (
        current &&
        this.context.library &&
        (await library(this.context).isLiked(
          this.interaction.user.id,
          current.track,
        ))
      )
        this.liked.add(current.id);
    }
  }
  private render(busy = this.state.busy) {
    return playerView(
      this.data,
      {
        ...this.state,
        busy,
        ...(this.shared ? { liked: new Set<string>() } : {}),
      },
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
    await this.load();
    const message = await this.edit();
    const collector = message.createMessageComponentCollector({
      time: 300_000,
      filter: (i) =>
        this.state.active &&
        (this.shared || i.user.id === this.interaction.user.id) &&
        this.action(i.customId) !== undefined,
    });
    this.context.trackCollector?.(collector);
    collector.on('collect', (i) => {
      if (
        !this.state.active ||
        (!this.shared && i.user.id !== this.interaction.user.id) ||
        (!i.isButton() && !i.isStringSelectMenu())
      )
        return;
      const action = this.action(i.customId);
      if (!action) return;
      if (action.name === 'close') {
        if (i.user.id !== this.interaction.user.id) {
          void i
            .reply({
              content: 'Only the menu creator can close this player.',
              flags: MessageFlags.Ephemeral,
            })
            .catch((error) =>
              this.context.reportComponentError?.(error, i.user.id),
            );
          return;
        }
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
      const started = Date.now();
      void withOperation(this.abort.signal, () => this.execute(i, action))
        .then(() =>
          this.context.audit?.record({
            command: `player:${action.name}`,
            guildId: this.interaction.guildId!,
            userId: i.user.id,
            timestamp: new Date(started).toISOString(),
            success: true,
            durationMs: Date.now() - started,
          }),
        )
        .catch((error) => this.failure(error, i))
        .finally(async () => {
          try {
            await this.load();
            await this.edit(false);
          } catch (error) {
            this.context.reportComponentError?.(error);
          } finally {
            this.state.busy = false;
          }
        });
    });
    collector.on('end', () => {
      this.abort.abort();
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
          await this.load();
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
    if (i.guildId !== this.interaction.guildId)
      throw new CommandError(
        'STALE_PLAYER',
        'This player belongs to another server.',
      );
    if (action.name === 'seek') {
      await this.seekModal(i, action.generation);
      return;
    }
    if (action.name === 'add') {
      await this.add(i);
      return;
    }
    if (action.name === 'lyrics' || action.name === 'discover') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await this.load();
      if (action.generation !== this.data.queue.generation)
        throw new CommandError(
          'STALE_PLAYER',
          'The song changed. Refresh the player.',
        );
      if (action.name === 'lyrics') {
        const track = this.data.queue.current?.track;
        if (!track)
          throw new CommandError('STALE_PLAYER', 'There is no current song.');
        const result = await resolveLyrics(this.context, track);
        if (result.kind === 'lyrics')
          await pages(
            i,
            this.context,
            `Lyrics - ${track.title.slice(0, 80)}`,
            lyricsChunks(result.text),
            1,
            1,
          );
        else
          await i.editReply({
            content:
              result.kind === 'instrumental'
                ? 'This track is instrumental.'
                : 'No lyrics were found.',
          });
      } else {
        if (!this.context.recommendations)
          throw new CommandError(
            'RECOMMENDATION_UNAVAILABLE',
            'Recommendations are unavailable.',
          );
        const tracks = await this.context.recommendations.recommend({
          guildId: i.guildId!,
          userId: i.user.id,
        });
        await showTrackResults(i, this.context, tracks);
      }
      return;
    }
    await i.deferUpdate();
    await this.load();
    delete this.state.notice;
    if (action.name === 'options') {
      this.state.optionsOpen = !this.state.optionsOpen;
      return;
    }
    if (
      trackActions.has(action.name) &&
      action.generation !== this.data.queue.generation
    )
      throw new CommandError(
        'STALE_PLAYER',
        'The song changed. Check the refreshed player and try again.',
      );
    const guildId = this.interaction.guildId!;
    if (action.name === 'rewind' || action.name === 'forward') {
      voiceTarget(i, this.context);
      if (!this.context.controls)
        throw new CommandError(
          'DJ_PERMISSION_REQUIRED',
          'Seek controls are unavailable.',
        );
      const position = Math.max(
        0,
        (this.context.music.playback(guildId).positionMs ?? 0) +
          (action.name === 'rewind' ? -10000 : 10000),
      );
      this.state.notice = await this.context.controls.perform(
        'seek',
        i,
        action.generation,
        position,
      );
      return;
    }
    if (
      ['previous', 'pause', 'resume', 'skip', 'stop', 'shuffle'].includes(
        action.name,
      )
    )
      voiceTarget(i, this.context);
    if (
      this.context.controls &&
      ['previous', 'pause', 'resume', 'skip', 'stop', 'shuffle'].includes(
        action.name,
      )
    ) {
      this.state.notice = await this.context.controls.perform(
        action.name as import('../../../services/PlaybackPolicyService.js').PlaybackAction,
        i,
        action.generation,
      );
      return;
    }
    if (
      ['repeat', 'autoplay', 'volume-down', 'volume-up', 'filter'].includes(
        action.name,
      )
    ) {
      if (!this.context.controls)
        throw new CommandError(
          'DJ_PERMISSION_REQUIRED',
          'Advanced player controls are unavailable.',
        );
      if (action.name === 'autoplay') {
        if (!this.context.policy)
          throw new CommandError(
            'DJ_PERMISSION_REQUIRED',
            'Playback authorization is unavailable.',
          );
        await this.context.policy.authorize(
          i,
          this.context.music,
          this.context.settings,
          'repeat',
        );
        if (!this.context.settings.setControls)
          throw new CommandError(
            'INVALID_SETTING',
            'Autoplay settings are unavailable.',
          );
        await this.context.settings.setControls(guildId, {
          autoplay: !this.data.autoplay,
        });
        await this.context.onSettingsChanged?.(guildId);
      } else if (action.name === 'repeat') {
        const modes = ['off', 'track', 'queue'] as const;
        const mode =
          modes[(modes.indexOf(this.data.queue.repeatMode) + 1) % 3]!;
        this.state.notice = await this.context.controls.perform(
          'repeat',
          i,
          action.generation,
          mode,
        );
      } else if (action.name === 'filter') {
        if (!i.isStringSelectMenu()) return;
        this.state.notice = await this.context.controls.perform(
          'filter',
          i,
          action.generation,
          i.values[0],
        );
      } else {
        const amount = Math.max(
          0,
          Math.min(
            100,
            (this.data.playback.volume ?? 100) +
              (action.name === 'volume-up' ? 10 : -10),
          ),
        );
        this.state.notice = await this.context.controls.perform(
          'volume',
          i,
          action.generation,
          amount,
        );
      }
      return;
    }
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
      const result = await library(this.context).toggleLikeSaved(
        i.user.id,
        entry.track,
      );
      if (!this.shared) {
        if (result.liked) this.liked.add(entry.id);
        else this.liked.delete(entry.id);
      }
      this.state.notice = result.liked
        ? result.changed
          ? 'Saved to your Liked Songs.'
          : 'This song is already in your Liked Songs.'
        : result.changed
          ? 'Removed from your Liked Songs.'
          : 'This song is not in your Liked Songs.';
    } else if (action.name === 'queue-prev') this.state.page--;
    else if (action.name === 'queue-next') this.state.page++;
  }
  private async seekModal(i: MessageComponentInteraction, generation: number) {
    voiceTarget(i, this.context);
    const id = `${this.prefix}:seek:${i.id}`;
    await i.showModal(
      new ModalBuilder()
        .setCustomId(id)
        .setTitle('Seek to a timestamp')
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Seconds, m:ss or h:mm:ss')
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId('timestamp')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(32),
            ),
        ),
    );
    const submitted = await i
      .awaitModalSubmit({
        time: Math.max(1, Math.min(60000, this.deadline - Date.now())),
        filter: (s) => s.user.id === i.user.id && s.customId === id,
      })
      .catch(() => undefined);
    if (!submitted) return;
    await submitted.deferUpdate();
    if (!this.state.active) {
      await submitted.followUp({
        content: 'This player has expired.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      voiceTarget(submitted, this.context);
      if (!this.context.controls)
        throw new CommandError(
          'DJ_PERMISSION_REQUIRED',
          'Seek controls are unavailable.',
        );
      this.state.notice = await this.context.controls.perform(
        'seek',
        submitted,
        generation,
        parseSeekTimestamp(submitted.fields.getTextInputValue('timestamp')),
      );
    } catch (e) {
      await this.failure(e, submitted);
    }
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
        filter: (s) => s.user.id === i.user.id && s.customId === id,
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
        userId: submitted.user.id,
        query: submitted.fields.getTextInputValue('query').trim(),
        voiceTarget: target,
      });
      await this.context.onVoiceActivity?.(target.guildId);
      this.state.notice = playResponse(outcome);
    } catch (error) {
      await this.failure(error, submitted);
    }
  }
  private async failure(
    error: unknown,
    i: MessageComponentInteraction | ModalSubmitInteraction,
  ) {
    this.context.reportComponentError?.(error, i.user.id);
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
