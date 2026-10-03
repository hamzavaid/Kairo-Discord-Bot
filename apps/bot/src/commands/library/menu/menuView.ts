import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type MessageEditOptions,
} from 'discord.js';
import type { LibraryCollection } from '@kairo/data';
import { uiText, resourceLink, duration } from '../../utility/formatTrack.js';
export interface MenuState {
  view: 'home' | 'playlists' | 'liked' | 'playlist';
  page: number;
  playlistId?: string;
  entryId?: string;
  notice?: string;
  confirmDelete?: LibraryCollection;
}
export interface MenuData {
  playlists: LibraryCollection[];
  liked: LibraryCollection;
  collection?: LibraryCollection;
}
export function menuView(
  state: MenuState,
  data: MenuData,
  prefix: string,
  expired = false,
  busy = false,
): MessageEditOptions {
  const card = new ContainerBuilder().setAccentColor(
    state.view === 'liked' ? 0x2ecc71 : 0x7c5cff,
  );
  const text = (content: string) =>
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  const button = (action: string, label: string, disabled = false) =>
    new ButtonBuilder()
      .setCustomId(`${prefix}:${action}`)
      .setLabel(label)
      .setStyle(action === 'play' ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(expired || disabled || (busy && action !== 'close'));
  const row = (...buttons: ButtonBuilder[]) =>
    card.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    );
  text(
    '## Kairo · Your library\n-# Prototype · Private to you · Changes save automatically',
  );
  row(
    button('home', 'Home'),
    button('liked', 'Liked Songs'),
    button('playlists', 'Playlists'),
    button('refresh', 'Refresh'),
    button('close', 'Close'),
  );
  card.addSeparatorComponents(new SeparatorBuilder());
  if (state.notice) text(`> ${uiText(state.notice, 350)}`);
  if (state.confirmDelete) {
    text(
      `### Delete playlist?\nDelete **${uiText(state.confirmDelete.name, 64)}** and its ${state.confirmDelete.entries.length} saved tracks? This cannot be undone.`,
    );
    row(
      button('confirm-delete', 'Confirm delete'),
      button('cancel-delete', 'Cancel'),
    );
  } else if (state.view === 'home') {
    text(
      `### Your library\n**${data.liked.entries.length}** liked songs · **${data.playlists.length}** playlists\nBrowse your saved music, add songs, or save a collection as a new playlist.`,
    );
    row(
      button('create', 'Create playlist'),
      button('like-current', 'Like current track'),
    );
  } else if (state.view === 'playlists') {
    const pages = Math.max(1, Math.ceil(data.playlists.length / 10));
    const items = data.playlists.slice((state.page - 1) * 10, state.page * 10);
    text(
      '### Playlists\n' +
        (items.length
          ? items
              .map(
                (p, index) =>
                  `${(state.page - 1) * 10 + index + 1}. **${uiText(p.name, 64)}** · ${p.entries.length} tracks`,
              )
              .join('\n')
          : 'No playlists yet. Create one to get started.'),
    );
    if (items.length)
      card.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`${prefix}:playlist-select`)
            .setPlaceholder('Open a playlist')
            .setDisabled(expired || busy)
            .addOptions(
              items.map((p) => ({
                label: p.name.slice(0, 100),
                value: p.id,
                description: `${p.entries.length} tracks`,
              })),
            ),
        ),
      );
    row(
      button('previous', 'Previous', state.page <= 1),
      button('next', 'Next', state.page >= pages),
      button('create', 'Create playlist'),
    );
    text(`-# Page ${state.page}/${pages}`);
  } else if (data.collection) {
    const collection = data.collection;
    const pages = Math.max(1, Math.ceil(collection.entries.length / 10));
    const entries = collection.entries.slice(
      (state.page - 1) * 10,
      state.page * 10,
    );
    text(
      `### ${uiText(collection.name, 64)}\n${
        entries.length
          ? entries
              .map((entry, index) => {
                const track = entry.track;
                const link = resourceLink(track.sourceProvider, track.sourceId);
                const title = uiText(track.title, 80);
                return `${(state.page - 1) * 10 + index + 1}. ${link ? `[${title}](<${link}>)` : title} — ${uiText(track.artists.map((a) => a.name).join(', '), 60)} · ${duration(track.durationMs)}`;
              })
              .join('\n')
          : 'This collection is empty. Add a song to get started.'
      }`,
    );
    if (entries.length)
      card.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`${prefix}:track-select`)
            .setPlaceholder('Choose a track to manage')
            .setDisabled(expired || busy)
            .addOptions(
              entries.map((entry) => ({
                label: entry.track.title.slice(0, 100),
                value: entry.id,
                description: entry.track.artists
                  .map((a) => a.name)
                  .join(', ')
                  .slice(0, 100),
                default: entry.id === state.entryId,
              })),
            ),
        ),
      );
    row(
      button('play', 'Play collection', !collection.entries.length),
      button('add', 'Add song'),
      button('save', 'Save as playlist'),
      button('previous', 'Previous', state.page <= 1),
      button('next', 'Next', state.page >= pages),
    );
    const selected = collection.entries.find((e) => e.id === state.entryId);
    if (selected) {
      text(`**Selected:** ${uiText(selected.track.title, 100)}`);
      row(
        button(
          state.view === 'liked' ? 'unlike' : 'like',
          state.view === 'liked' ? 'Unlike' : 'Like selected',
        ),
        ...(state.view === 'playlist'
          ? [button('remove', 'Remove from playlist')]
          : []),
        button('save-track', 'Save track to playlist'),
      );
    }
    text(
      `-# Page ${state.page}/${pages} · ${collection.entries.length} tracks · Saved to your library`,
    );
    if (state.view === 'playlist') row(button('delete', 'Delete playlist'));
  }
  if (busy && !expired)
    text('-# Waiting for your input or finishing an action.');
  if (expired) text('-# Menu expired or closed. Run /menu to open it again.');
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [card],
    allowedMentions: { parse: [] },
  };
}
