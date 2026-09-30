import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { CommandRequest } from './types.js';

/** Discord objects stop here; controllers receive a small application request. */
export function toCommandRequest(
  interaction: ChatInputCommandInteraction,
): CommandRequest {
  const guildId = interaction.guildId ?? undefined;
  const channelId =
    interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId ??
    undefined;
  return {
    name: interaction.commandName,
    userId: interaction.user.id,
    ...(guildId ? { guildId } : {}),
    ...(channelId ? { voiceChannelId: channelId } : {}),
    ...(guildId && channelId && interaction.guild
      ? {
          voiceTarget: {
            guildId,
            channelId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
          },
        }
      : {}),
    ...(interaction.options.getString('query') === null
      ? {}
      : { query: interaction.options.getString('query')! }),
    ...(interaction.options.getInteger('page') === null
      ? {}
      : { page: interaction.options.getInteger('page')! }),
    ...(interaction.options.getInteger('timeout_seconds') === null
      ? {}
      : { timeoutSeconds: interaction.options.getInteger('timeout_seconds')! }),
    ...(interaction.options.getString('audio_quality') === null
      ? {}
      : {
          audioQuality: interaction.options.getString(
            'audio_quality',
          )! as NonNullable<CommandRequest['audioQuality']>,
        }),
    canManageGuild:
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
      false,
    createdTimestamp: interaction.createdTimestamp,
    websocketPing: interaction.client.ws.ping,
    async defer() {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
    },
    async respond(message) {
      const options = {
        ...(message.content === undefined ? {} : { content: message.content }),
        ...(message.components === undefined
          ? {}
          : { components: message.components }),
        allowedMentions: { parse: [] as [] },
      };
      const flags =
        (message.flags ?? 0) | (message.ephemeral ? MessageFlags.Ephemeral : 0);
      if (interaction.deferred) {
        await interaction.editReply({
          ...options,
          ...(message.flags === MessageFlags.IsComponentsV2
            ? { flags: MessageFlags.IsComponentsV2 }
            : {}),
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          ...options,
          ...(flags ? { flags } : {}),
        });
      } else {
        await interaction.reply({
          ...options,
          ...(flags ? { flags } : {}),
        });
      }
    },
  };
}
