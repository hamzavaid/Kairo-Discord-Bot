import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type MessageEditOptions,
} from 'discord.js';
import type {
  PlaybackSnapshot,
  QueueSnapshot,
  Track,
} from '@kairo/music-engine';
import {
  duration,
  resourceLink,
  uiText,
  trackArtwork,
} from '../../utility/formatTrack.js';

export interface PlayerData {
  queue: QueueSnapshot;
  playback: PlaybackSnapshot;
}
export interface PlayerViewState {
  page: number;
  active: boolean;
  busy: boolean;
  liked: ReadonlySet<string>;
  notice?: string;
}
function heading(track: Track, limit = 140) {
  const link = resourceLink(track.sourceProvider, track.sourceId);
  const title = uiText(track.title, limit);
  return link ? `[${title}](<${link}>)` : title;
}
const statusLabels: Record<PlaybackSnapshot['state'], string> = {
  DISCONNECTED: 'Not connected',
  CONNECTING: 'Connecting to voice',
  IDLE: 'Ready to play',
  RESOLVING: 'Finding audio',
  BUFFERING: 'Loading your song',
  PLAYING: 'Playing',
  PAUSED: 'Paused',
  STOPPING: 'Stopping playback',
  ERROR: 'Playback interrupted',
};
const icons: Record<string, string> = {
  previous: '\u23ee\ufe0f',
  pause: '\u23f8\ufe0f',
  resume: '\u25b6\ufe0f',
  skip: '\u23ed\ufe0f',
  shuffle: '\ud83d\udd00',
  like: '\u2665\ufe0f',
  add: '\u2795',
  refresh: '\ud83d\udd04',
  stop: '\u23f9\ufe0f',
  close: '\u2716\ufe0f',
  'queue-prev': '\u2b05\ufe0f',
  'queue-next': '\u27a1\ufe0f',
};
function sourceName(provider: string): string {
  if (provider === 'youtube-sr' || provider === 'youtube-api') return 'YouTube';
  if (provider === 'spotify') return 'Spotify';
  if (provider === 'musicbrainz') return 'MusicBrainz';
  if (provider === 'fixture') return 'Local audio';
  return 'Music';
}
export function playerView(
  data: PlayerData,
  state: PlayerViewState,
  prefix: string,
  hasLibrary: boolean,
): MessageEditOptions {
  const { queue, playback } = data;
  const current = queue.current;
  const track = current?.track;
  const pages = Math.max(1, Math.ceil(queue.upcoming.length / 10));
  const page = Math.max(1, Math.min(state.page, pages));
  const controls = (
    action: string,
    label: string,
    disabled = false,
    style = ButtonStyle.Secondary,
  ) => {
    const button = new ButtonBuilder()
      .setCustomId(`${prefix}:${action}:${queue.generation}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(
        !state.active || (state.busy && action !== 'close') || disabled,
      );
    if (icons[action]) button.setEmoji({ name: icons[action] });
    return button;
  };
  const card = new ContainerBuilder()
    .setAccentColor(
      !state.active
        ? 0x58616e
        : playback.state === 'PAUSED'
          ? 0xf2b34c
          : 0x1db954,
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Kairo Player\n-# ${!state.active ? 'Menu closed' : statusLabels[playback.state]}${state.busy ? ' \u00b7 Updating...' : ''}`,
      ),
    );
  if (track) {
    const song = new TextDisplayBuilder().setContent(
      `### ${heading(track, 100)}\n${track.artists
        .slice(0, 3)
        .map((a) => uiText(a.name, 50))
        .join(
          ' \u00b7 ',
        )}\n-# ${track.isLive ? 'Live' : duration(track.durationMs)} \u00b7 ${sourceName(track.sourceProvider)}${track.album ? ` \u00b7 ${uiText(track.album.title, 80)}` : ''}`,
    );
    const image = trackArtwork(track);
    if (image)
      card.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(song)
          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(image)
              .setDescription('Current song artwork'),
          ),
      );
    else card.addTextDisplayComponents(song);
  } else
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### Nothing playing\nAdd a song or playlist to start listening. Your upcoming songs will appear below.',
      ),
    );
  card.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      controls(
        'previous',
        'Previous',
        !queue.history.length || playback.state === 'DISCONNECTED',
      ),
      playback.state === 'PAUSED'
        ? controls('resume', 'Resume', !current, ButtonStyle.Primary)
        : controls(
            'pause',
            'Pause',
            !current || playback.state !== 'PLAYING',
            ButtonStyle.Primary,
          ),
      controls('skip', 'Skip', !current),
    ),
  );
  const liked = current && state.liked.has(current.id);
  card.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      controls('shuffle', 'Shuffle', queue.upcoming.length < 2),
      controls(
        'like',
        liked ? 'Liked' : 'Like song',
        !current || !hasLibrary || Boolean(liked),
        ButtonStyle.Success,
      ),
      controls('add', 'Add song', false),
    ),
  );
  const lines = queue.upcoming.slice((page - 1) * 10, page * 10).map(
    (entry, offset) =>
      `**${String((page - 1) * 10 + offset + 1).padStart(2, '0')}** ${heading(entry.track, 40)}  \`${entry.track.isLive ? 'Live' : duration(entry.track.durationMs)}\`\n-# ${entry.track.artists
        .slice(0, 1)
        .map((a) => uiText(a.name, 25))
        .join(', ')}`,
  );
  const repeat =
    queue.repeatMode === 'off'
      ? 'Repeat off'
      : queue.repeatMode === 'track'
        ? 'Repeating this song'
        : 'Repeating queue';
  card
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Up next\n-# ${queue.upcoming.length} ${queue.upcoming.length === 1 ? 'song' : 'songs'} \u00b7 ${repeat}\n\n${lines.join('\n\n') || 'Your queue is clear. Add something you love.'}\n\n-# Page ${page}/${pages}`,
      ),
    );
  if (pages > 1)
    card.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        controls('queue-prev', 'Previous page', page <= 1),
        controls('queue-next', 'Next page', page >= pages),
      ),
    );
  if (state.notice)
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${uiText(state.notice, 150)}`),
    );
  card
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        controls('refresh', 'Refresh'),
        controls(
          'stop',
          'Stop',
          !current && !queue.upcoming.length,
          ButtonStyle.Danger,
        ),
        controls('close', 'Close'),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        state.active
          ? '-# Your player \u00b7 Auto-updates \u00b7 Controls expire after 5 minutes'
          : '-# Menu closed or expired \u00b7 Run /player to reopen. Music keeps playing.',
      ),
    );
  return {
    components: [card],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
