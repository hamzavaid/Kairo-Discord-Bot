import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';
import { confirm, pages } from './components.js';
import { library, trackLines, voiceTarget } from './helpers.js';
const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('liked')
    .setDescription('Manage your persistent Liked Songs')
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('List your liked tracks')
        .addIntegerOption((o) =>
          o.setName('page').setDescription('Page number').setMinValue(1),
        ),
    )
    .addSubcommand((s) =>
      s.setName('play').setDescription('Play your liked tracks in order'),
    )
    .addSubcommand((s) =>
      s
        .setName('clear')
        .setDescription('Clear your Liked Songs after confirmation'),
    ),
  usage: '/liked list [page] | play | clear',
  category: 'Library',
  async execute(interaction, context) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const service = library(context);
    const owner = interaction.user.id;
    const sub = interaction.options.getSubcommand();
    if (sub === 'play') {
      const target = voiceTarget(interaction, context);
      const result = await service.playLiked(owner, target);
      await context.onVoiceActivity?.(target.guildId);
      await interaction.editReply({
        content: `Queued ${result.queued} liked tracks.`,
      });
      return;
    }
    const collection = await service.liked(owner);
    if (sub === 'clear') {
      await confirm(
        interaction,
        context,
        `Clear all ${collection.entries.length} liked tracks?`,
        async () => {
          await service.clearLiked(owner, collection);
          return 'Cleared your Liked Songs.';
        },
      );
      return;
    }
    await pages(
      interaction,
      context,
      'Your Liked Songs',
      trackLines(collection),
      interaction.options.getInteger('page') ?? 1,
    );
  },
};
export default command;
