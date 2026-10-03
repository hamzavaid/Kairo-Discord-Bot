import {
  MessageFlags,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { LibraryError } from '@kairo/data';
import type { CommandExecutionContext } from '../../types.js';
import { library, voiceTarget } from '../helpers.js';
import { menuView, type MenuState, type MenuData } from './menuView.js';

const actions = new Set([
  'home',
  'liked',
  'playlists',
  'refresh',
  'close',
  'create',
  'like-current',
  'playlist-select',
  'track-select',
  'previous',
  'next',
  'play',
  'add',
  'save',
  'like',
  'unlike',
  'remove',
  'save-track',
  'delete',
  'confirm-delete',
  'cancel-delete',
]);
const modalActions = new Set(['create', 'add', 'save', 'save-track']);
/** One controller per message. No shared user state or second playback path. */
export class LibraryMenu {
  private state: MenuState = { view: 'home', page: 1 };
  private data!: MenuData;
  private active = true;
  private busy = false;
  private readonly deadline = Date.now() + 300_000;
  private readonly prefix: string;
  private readonly service;
  constructor(
    private readonly interaction: ChatInputCommandInteraction,
    private readonly context: CommandExecutionContext,
  ) {
    this.prefix = `kairo:menu:${interaction.id}`;
    this.service = library(context);
  }
  private get owner() {
    return this.interaction.user.id;
  }
  private async load() {
    const [playlists, liked] = await Promise.all([
      this.service.list(this.owner),
      this.service.liked(this.owner),
    ]);
    this.data = { playlists, liked };
    if (this.state.view === 'playlist') {
      const collection = playlists.find((p) => p.id === this.state.playlistId);
      if (!collection) {
        this.state = {
          view: 'playlists',
          page: 1,
          notice: 'That playlist is no longer available.',
        };
      } else this.data.collection = collection;
    } else if (this.state.view === 'liked') this.data.collection = liked;
    const total =
      this.state.view === 'playlists'
        ? playlists.length
        : (this.data.collection?.entries.length ?? 0);
    this.state.page = Math.max(
      1,
      Math.min(this.state.page, Math.max(1, Math.ceil(total / 10))),
    );
    if (
      this.state.entryId &&
      !this.data.collection?.entries.some((e) => e.id === this.state.entryId)
    )
      delete this.state.entryId;
  }
  private render(busy = this.busy) {
    return menuView(this.state, this.data, this.prefix, !this.active, busy);
  }
  async start() {
    await this.load();
    const message = await this.interaction.editReply(this.render());
    const collector = message.createMessageComponentCollector({
      time: 300_000,
      filter: (i) =>
        this.active &&
        i.user.id === this.owner &&
        this.action(i.customId) !== undefined,
    });
    collector.on('collect', (i) => {
      if (!this.active || i.user.id !== this.owner) return;
      const action = this.action(i.customId);
      if (!action) return;
      if (action === 'close') {
        this.active = false;
        collector.stop('closed');
        void i
          .update(this.render())
          .catch((error) => this.context.reportComponentError?.(error));
        return;
      }
      if (this.busy) {
        void i
          .reply({
            content:
              'Another menu action is in progress. Try again in a moment.',
            flags: MessageFlags.Ephemeral,
          })
          .catch((error) => this.context.reportComponentError?.(error));
        return;
      }
      this.busy = true;
      void this.execute(i, action)
        .catch((error) => this.failure(error, i))
        .finally(async () => {
          try {
            await this.interaction.editReply(this.render(false));
          } catch (error) {
            this.context.reportComponentError?.(error);
          } finally {
            this.busy = false;
          }
        });
    });
    collector.on('end', () => {
      this.active = false;
      void this.interaction
        .editReply(this.render())
        .catch((error) => this.context.reportComponentError?.(error));
    });
  }
  private action(id: string): string | undefined {
    if (!id.startsWith(`${this.prefix}:`)) return;
    const action = id.slice(this.prefix.length + 1);
    return actions.has(action) ? action : undefined;
  }
  private async failure(error: unknown, i: MessageComponentInteraction) {
    this.context.reportComponentError?.(error);
    const content =
      this.context.componentErrorMessage?.(error) ??
      'The menu action could not be completed.';
    try {
      if (i.deferred || i.replied)
        await i.followUp({
          content,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      else
        await i.reply({
          content,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
    } catch (responseError) {
      this.context.reportComponentError?.(responseError);
    }
  }
  private collection() {
    if (!this.data.collection)
      throw new LibraryError(
        'COLLECTION_EMPTY',
        'Open a saved collection first.',
      );
    return this.data.collection;
  }
  private selected() {
    const entry = this.collection().entries.find(
      (e) => e.id === this.state.entryId,
    );
    if (!entry)
      throw new LibraryError('TRACK_NOT_FOUND', 'Choose a saved track first.');
    return entry;
  }
  private async execute(i: MessageComponentInteraction, action: string) {
    if (modalActions.has(action)) {
      await this.modal(i, action);
      return;
    }
    const navigation = [
      'home',
      'liked',
      'playlists',
      'refresh',
      'previous',
      'next',
      'playlist-select',
      'track-select',
    ].includes(action);
    if (navigation) await i.update(this.render());
    else await i.deferUpdate();
    await this.load();
    delete this.state.notice;
    if (action === 'home' || action === 'liked' || action === 'playlists')
      this.state = { view: action, page: 1 };
    else if (action === 'previous' || action === 'next') {
      this.state.page += action === 'previous' ? -1 : 1;
      delete this.state.entryId;
    } else if (action === 'playlist-select' && i.isStringSelectMenu()) {
      const playlist = this.data.playlists
        .slice((this.state.page - 1) * 10, this.state.page * 10)
        .find((p) => p.id === i.values[0]);
      if (!playlist)
        throw new LibraryError(
          'PLAYLIST_NOT_FOUND',
          'Choose a playlist from this page.',
        );
      this.state = { view: 'playlist', playlistId: playlist.id, page: 1 };
    } else if (action === 'track-select' && i.isStringSelectMenu()) {
      const entry = this.collection()
        .entries.slice((this.state.page - 1) * 10, this.state.page * 10)
        .find((e) => e.id === i.values[0]);
      if (!entry)
        throw new LibraryError(
          'TRACK_NOT_FOUND',
          'Choose a track from this page.',
        );
      this.state.entryId = entry.id;
    } else if (action === 'like-current') {
      const result = await this.service.like(
        this.owner,
        this.interaction.guildId!,
      );
      this.state.notice = result.added
        ? 'Current track added to Liked Songs.'
        : 'Current track is already liked.';
    } else if (action === 'like') {
      const result = await this.service.likeSaved(
        this.owner,
        this.selected().track,
      );
      this.state.notice = result.added
        ? 'Added to Liked Songs.'
        : 'Already in Liked Songs.';
    } else if (action === 'unlike') {
      await this.service.unlikeSaved(this.owner, this.selected().track);
      this.state.notice = 'Removed from Liked Songs.';
    } else if (action === 'remove') {
      if (this.state.view !== 'playlist')
        throw new LibraryError('TRACK_NOT_FOUND', 'Open a playlist first.');
      await this.service.removeEntry(
        this.owner,
        this.collection().name,
        this.selected().id,
      );
      this.state.notice = 'Removed from this playlist.';
    } else if (action === 'delete') {
      if (this.state.view !== 'playlist')
        throw new LibraryError('PLAYLIST_NOT_FOUND', 'Open a playlist first.');
      this.state.confirmDelete = this.collection();
    } else if (action === 'cancel-delete') {
      delete this.state.confirmDelete;
    } else if (action === 'confirm-delete') {
      const snapshot = this.state.confirmDelete;
      if (!snapshot)
        throw new LibraryError(
          'PLAYLIST_NOT_FOUND',
          'Request a deletion confirmation first.',
        );
      await this.service.delete(this.owner, snapshot.name, snapshot);
      this.state = { view: 'playlists', page: 1, notice: 'Deleted playlist.' };
    } else if (action === 'play') {
      const target = voiceTarget(i, this.context);
      const result =
        this.state.view === 'liked'
          ? await this.service.playLiked(this.owner, target)
          : await this.service.play(this.owner, this.collection().name, target);
      await this.context.onVoiceActivity?.(target.guildId);
      this.state.notice = `Queued ${result.queued} tracks.`;
    }
    await this.load();
  }
  private async modal(i: MessageComponentInteraction, action: string) {
    // Capture the current target before waiting for user input.
    const source =
      this.state.view === 'liked'
        ? { kind: 'liked' as const }
        : { kind: 'playlist' as const, name: this.data.collection?.name ?? '' };
    const track = action === 'save-track' ? this.selected().track : undefined;
    const field = action === 'add' ? 'query' : 'name';
    const id = `${this.prefix}:modal:${i.id}`;
    const modal = new ModalBuilder()
      .setCustomId(id)
      .setTitle(
        action === 'create'
          ? 'Create playlist'
          : action === 'save'
            ? 'Save as new playlist'
            : action === 'save-track'
              ? 'Save track to playlist'
              : 'Add song',
      );
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(
          field === 'query'
            ? 'Song query or track URL'
            : action === 'save-track'
              ? 'Existing playlist name'
              : 'New playlist name',
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(field)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(field === 'name' ? 64 : 500),
        ),
    );
    await i.showModal(modal);
    // Attach the modal listener before editing the parent message: a fast submit
    // must not be lost during another Discord request.
    const response = i
      .awaitModalSubmit({
        time: Math.max(1, Math.min(60_000, this.deadline - Date.now())),
        filter: (s) => s.user.id === this.owner && s.customId === id,
      })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    await this.interaction.editReply(this.render());
    let submitted: ModalSubmitInteraction;
    try {
      const result = await response;
      if ('error' in result) throw result.error;
      submitted = result.value;
    } catch (error) {
      if ((error as { code?: string })?.code !== 'InteractionCollectorError')
        throw error;
      if (this.active) {
        this.state.notice = 'Input timed out. No changes were made.';
        await this.interaction.editReply(this.render());
      }
      return;
    }
    if (!this.active || Date.now() >= this.deadline) {
      this.active = false;
      await submitted.reply({
        content: 'This menu has expired. Run /menu again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await submitted.deferUpdate();
    try {
      const value = submitted.fields.getTextInputValue(field).trim();
      if (action === 'create') {
        const collection = await this.service.create(this.owner, value);
        this.state = {
          view: 'playlist',
          page: 1,
          playlistId: collection.id,
          notice: 'Created playlist.',
        };
      } else if (action === 'add') {
        const result =
          source.kind === 'liked'
            ? await this.service.like(
                this.owner,
                this.interaction.guildId!,
                value,
              )
            : await this.service.add(
                this.owner,
                source.name,
                value,
                this.interaction.guildId!,
              );
        this.state.notice = result.added
          ? 'Saved the song.'
          : 'That song is already saved.';
      } else if (action === 'save') {
        const collection = await this.service.saveCollection(
          this.owner,
          source,
          value,
        );
        this.state.notice = `Saved ${collection.entries.length} tracks as ${collection.name}.`;
      } else if (action === 'save-track' && track) {
        const result = await this.service.addSaved(this.owner, value, track);
        this.state.notice = result.added
          ? 'Saved track to playlist.'
          : 'That track is already in the playlist.';
      }
      await this.load();
    } catch (error) {
      this.context.reportComponentError?.(error);
      await submitted.followUp({
        content:
          this.context.componentErrorMessage?.(error) ??
          'The menu action could not be completed.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }
  }
}
