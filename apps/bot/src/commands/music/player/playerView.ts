import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
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
  ) =>
    new ButtonBuilder()
      .setCustomId(`${prefix}:${action}:${queue.generation}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(
        !state.active || (state.busy && action !== 'close') || disabled,
      );
  const card = new ContainerBuilder()
    .setAccentColor(0x1db954)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Kairo Player'),
    );
  if (track) {
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${heading(track)}\n${track.artists
          .slice(0, 3)
          .map((a) => uiText(a.name, 50))
          .join(' | ')}`,
      ),
    );
    const image = trackArtwork(track);
    if (image)
      card.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems((item) =>
          item.setURL(image).setDescription('Current song artwork'),
        ),
      );
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**State:** ${playback.state} | **Duration:** ${track.isLive ? 'Live' : duration(track.durationMs)}`,
          `**Album:** ${track.album ? uiText(track.album.title, 100) : 'Not provided'}`,
          `**Provider:** ${uiText(track.sourceProvider, 60)}${track.provenance.confidence === undefined ? '' : ` | **Match:** ${track.provenance.confidence.toFixed(2)}`}`,
        ].join('\n'),
      ),
    );
  } else
    card.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Nothing playing\n**State:** ${playback.state} | Add a song to get started.`,
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
      controls(
        'stop',
        'Stop',
        !current && !queue.upcoming.length,
        ButtonStyle.Danger,
      ),
    ),
  );
  const liked = current && state.liked.has(current.id);
  card.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      controls(
        'like',
        liked ? 'Liked' : 'Like song',
        !current || !hasLibrary || Boolean(liked),
        ButtonStyle.Success,
      ),
      controls('add', 'Add song', false, ButtonStyle.Primary),
      controls('refresh', 'Refresh'),
      controls('close', 'Close'),
    ),
  );
  const lines = queue.upcoming.slice((page - 1) * 10, page * 10).map(
    (entry, offset) =>
      `${(page - 1) * 10 + offset + 1}. ${heading(entry.track, 40)} - ${entry.track.artists
        .slice(0, 1)
        .map((a) => uiText(a.name, 25))
        .join(', ')} | ${duration(entry.track.durationMs)}`,
  );
  card
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Up next | ${queue.upcoming.length} songs\n${lines.join('\n') || 'The queue is empty.'}\n-# Page ${page}/${pages} | Repeat: ${queue.repeatMode}`,
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
      new TextDisplayBuilder().setContent(uiText(state.notice, 150)),
    );
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      state.active
        ? '-# Your controls | Updates every 10 seconds | Expires after 5 minutes'
        : '-# Menu closed or expired | Run /player to open a new player.',
    ),
  );
  return {
    components: [card],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
