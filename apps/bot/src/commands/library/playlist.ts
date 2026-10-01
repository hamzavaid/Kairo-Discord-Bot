import {
  MessageFlags,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { guild } from '../guards.js';
import type { SlashCommand } from '../types.js';
import { confirm, pages } from './components.js';
import { display, library, trackLines, voiceTarget } from './helpers.js';
const named = (s: SlashCommandSubcommandBuilder) =>
  s.addStringOption((o) =>
    o
      .setName('name')
      .setDescription('Your playlist name')
      .setRequired(true)
      .setMaxLength(64),
  );
const pageable = (s: SlashCommandSubcommandBuilder) =>
  s.addIntegerOption((o) =>
    o.setName('page').setDescription('Page number').setMinValue(1),
  );
const data = new SlashCommandBuilder()
  .setName('playlist')
  .setDescription('Manage your persistent playlists')
  .addSubcommand((s) =>
    named(s.setName('create').setDescription('Create an empty playlist')),
  )
  .addSubcommand((s) =>
    named(
      s
        .setName('delete')
        .setDescription('Delete a playlist after confirmation'),
    ),
  )
  .addSubcommand((s) =>
    pageable(s.setName('list').setDescription('List your playlists')),
  )
  .addSubcommand((s) =>
    pageable(
      named(s.setName('show').setDescription('Show ordered playlist tracks')),
    ),
  )
  .addSubcommand((s) =>
    pageable(
      named(
        s
          .setName('info')
          .setDescription('Show playlist information and tracks'),
      ),
    ),
  )
  .addSubcommand((s) =>
    named(
      s.setName('add').setDescription('Resolve and add a song'),
    ).addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Song query or track URL')
        .setRequired(true),
    ),
  )
  .addSubcommand((s) =>
    named(
      s.setName('remove').setDescription('Remove a track by position'),
    ).addIntegerOption((o) =>
      o
        .setName('position')
        .setDescription('One-based track position')
        .setMinValue(1)
        .setRequired(true),
    ),
  )
  .addSubcommand((s) =>
    named(s.setName('move').setDescription('Move a track within the playlist'))
      .addIntegerOption((o) =>
        o
          .setName('from')
          .setDescription('Current position')
          .setMinValue(1)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o
          .setName('to')
          .setDescription('New position')
          .setMinValue(1)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    named(
      s.setName('rename').setDescription('Rename a playlist'),
    ).addStringOption((o) =>
      o
        .setName('new_name')
        .setDescription('New playlist name')
        .setMaxLength(64)
        .setRequired(true),
    ),
  )
  .addSubcommand((s) =>
    named(
      s.setName('edit').setDescription('Edit a playlist name'),
    ).addStringOption((o) =>
      o
        .setName('new_name')
        .setDescription('New playlist name')
        .setMaxLength(64)
        .setRequired(true),
    ),
  )
  .addSubcommand((s) =>
    named(
      s
        .setName('clear')
        .setDescription('Clear playlist tracks after confirmation'),
    ),
  )
  .addSubcommand((s) =>
    named(s.setName('play').setDescription('Queue your playlist in order')),
  )
  .addSubcommand((s) =>
    named(
      s
        .setName('import')
        .setDescription('Import or append a supported collection'),
    ).addStringOption((o) =>
      o
        .setName('url')
        .setDescription('YouTube playlist or Spotify playlist/album URL')
        .setRequired(true),
    ),
  );
const command: SlashCommand = {
  data,
  usage:
    '/playlist create | delete | list | show | add | remove | move | rename | play | import',
  category: 'Library',
  async execute(interaction, context) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const service = library(context);
    const owner = interaction.user.id;
    const sub = interaction.options.getSubcommand();
    const name = interaction.options.getString('name') ?? '';
    const page = interaction.options.getInteger('page') ?? 1;
    let content: string;
    switch (sub) {
      case 'create':
        content = `Created ${display((await service.create(owner, name)).name)}.`;
        break;
      case 'list': {
        const collections = await service.list(owner);
        await pages(
          interaction,
          context,
          'Your playlists',
          collections.map(
            (c, index) =>
              `${index + 1}. ${display(c.name, 64)} · ${c.entries.length} tracks`,
          ),
          page,
        );
        return;
      }
      case 'show':
      case 'info': {
        const collection = await service.get(owner, name);
        await pages(
          interaction,
          context,
          `${display(collection.name, 64)} · ${collection.entries.length} tracks`,
          trackLines(collection),
          page,
        );
        return;
      }
      case 'delete': {
        const collection = await service.get(owner, name);
        await confirm(
          interaction,
          context,
          `Delete ${display(collection.name, 64)} and its ${collection.entries.length} tracks?`,
          async () => {
            await service.delete(owner, name, collection);
            return `Deleted ${display(collection.name, 64)}.`;
          },
        );
        return;
      }
      case 'clear': {
        const collection = await service.get(owner, name);
        await confirm(
          interaction,
          context,
          `Clear all ${collection.entries.length} tracks from ${display(collection.name, 64)}?`,
          async () => {
            await service.clear(owner, name, collection);
            return 'Cleared playlist tracks.';
          },
        );
        return;
      }
      case 'add': {
        const result = await service.add(
          owner,
          name,
          interaction.options.getString('query', true),
          guild(interaction),
        );
        content = result.added
          ? 'Added the track.'
          : 'That track is already in this playlist.';
        break;
      }
      case 'remove':
        await service.remove(
          owner,
          name,
          interaction.options.getInteger('position', true),
        );
        content = 'Removed the track.';
        break;
      case 'move':
        await service.move(
          owner,
          name,
          interaction.options.getInteger('from', true),
          interaction.options.getInteger('to', true),
        );
        content = 'Moved the track.';
        break;
      case 'rename':
      case 'edit':
        content = `Renamed to ${display((await service.rename(owner, name, interaction.options.getString('new_name', true))).name, 64)}.`;
        break;
      case 'play': {
        const target = voiceTarget(interaction, context);
        const result = await service.play(owner, name, target);
        await context.onVoiceActivity?.(target.guildId);
        content = `Queued ${result.queued} playlist tracks.`;
        break;
      }
      case 'import': {
        const result = await service.importCollection(
          owner,
          name,
          interaction.options.getString('url', true),
          guild(interaction),
        );
        content = `${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed · ${result.total} source items.${result.truncated ? ' Import limit reached.' : ''}`;
        break;
      }
      default:
        content = 'Choose a playlist operation.';
    }
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  },
};
export default command;
