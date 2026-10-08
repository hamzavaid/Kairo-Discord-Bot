import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  escapeMarkdown,
} from 'discord.js';
import type { Track } from '@kairo/music-engine';

export const uiText = (value: string, limit = 200) =>
  escapeMarkdown(value.replace(/[\r\n\p{Cc}]/gu, ' ').slice(0, limit));
export function duration(ms?: number): string {
  if (ms === undefined) return 'Unknown';
  return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
}
/** Only known canonical resources become hyperlinks, never signed stream URLs. */
export function resourceLink(
  provider: string,
  id?: string,
): string | undefined {
  if (!id) return;
  if (
    (provider === 'youtube-sr' || provider === 'youtube-api') &&
    /^[A-Za-z0-9_-]{11}$/u.test(id)
  )
    return `https://www.youtube.com/watch?v=${id}`;
  if (provider === 'spotify' && /^[A-Za-z0-9]{22}$/u.test(id))
    return `https://open.spotify.com/track/${id}`;
  if (provider === 'musicbrainz' && /^[0-9a-f-]{36}$/iu.test(id))
    return `https://musicbrainz.org/recording/${id}`;
  if (provider === 'fixture' && /^[a-z0-9-]+$/u.test(id))
    return `https://fixture.kairo.invalid/tracks/${id}`;
}
function artwork(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      ['i.ytimg.com', 'i.scdn.co', 'coverartarchive.org', 'archive.org'].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    )
      return url.href;
  } catch {
    /* Omit invalid image URLs. */
  }
}
/** Canonical video pictures or allowlisted, unsigned catalog artwork. */
export function trackArtwork(track: Track): string | undefined {
  if (
    (track.sourceProvider === 'youtube-sr' ||
      track.sourceProvider === 'youtube-api') &&
    track.sourceId &&
    /^[A-Za-z0-9_-]{11}$/u.test(track.sourceId)
  )
    return `https://i.ytimg.com/vi/${track.sourceId}/hqdefault.jpg`;
  return artwork(track.artworkUrl);
}
export function infoCard(track: Track): ContainerBuilder {
  const source = resourceLink(track.sourceProvider, track.sourceId);
  const title = uiText(track.title, 350);
  const header = new TextDisplayBuilder().setContent(
    `## ${source ? `[${title}](<${source}>)` : title}\n${track.artists
      .slice(0, 6)
      .map((a) => uiText(a.name, 100))
      .join(' · ')}`,
  );
  const card = new ContainerBuilder().setAccentColor(0x7c5cff);

  const videoId =
    (track.sourceProvider === 'youtube-sr' ||
      track.sourceProvider === 'youtube-api') &&
    track.sourceId &&
    /^[A-Za-z0-9_-]{11}$/u.test(track.sourceId)
      ? track.sourceId
      : undefined;
  const image = trackArtwork(track);
  if (videoId && image) {
    card
      .addTextDisplayComponents(header)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems((item) =>
          item.setURL(image).setDescription('YouTube video picture'),
        ),
      );
  } else if (image)
    card.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(image).setDescription('Track artwork'),
        ),
    );
  else card.addTextDisplayComponents(header);
  const album = track.album ? uiText(track.album.title, 200) : 'Not provided';
  const albumLink =
    track.sourceProvider === 'spotify' &&
    track.album?.id &&
    /^[A-Za-z0-9]{22}$/u.test(track.album.id)
      ? `https://open.spotify.com/album/${track.album.id}`
      : undefined;
  card
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Album:** ${albumLink ? `[${album}](<${albumLink}>)` : album}`,
          `**Duration:** ${track.isLive ? 'Live' : duration(track.durationMs)}${track.explicit ? ' · Explicit' : ''}`,
          `**Provider:** ${uiText(track.sourceProvider, 80)}`,
          `**Resolved by:** ${uiText(track.provenance.parsedBy, 80)}`,
          ...(track.sourceId
            ? [`**Source ID:** ${uiText(track.sourceId, 100)}`]
            : []),
          ...(track.provenance.originalSourceProvider
            ? [
                `**Original source:** ${uiText(track.provenance.originalSourceProvider, 80)}`,
              ]
            : []),
          ...(track.provenance.confidence === undefined
            ? []
            : [`Confidence: ${track.provenance.confidence.toFixed(2)}`]),
        ].join('\n'),
      ),
    );
  if (source)
    card.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Open source')
          .setStyle(ButtonStyle.Link)
          .setURL(source),
      ),
    );
  card.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '-# Metadata only · Nothing was queued or played.',
    ),
  );
  return card;
}
