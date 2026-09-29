import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { CommandRequest } from './types.js';

/** Discord objects stop here; controllers receive a small application request. */
export function toCommandRequest(
  interaction: ChatInputCommandInteraction,
): CommandRequest {
  const guildId = interaction.guildId ?? undefined;
  const channelId =
    interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId ??
    undefined;
  let deferred = interaction.deferred;
  let replied = interaction.replied;
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
    createdTimestamp: interaction.createdTimestamp,
    websocketPing: interaction.client.ws.ping,
    async defer() {
      if (!deferred && !replied) {
        await interaction.deferReply();
        deferred = true;
      }
    },
    async respond(content, ephemeral) {
      const options = { content, allowedMentions: { parse: [] as [] } };
      if (deferred) {
        await interaction.editReply(options);
      } else if (replied) {
        await interaction.followUp({
          ...options,
          ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
        });
      } else {
        await interaction.reply({
          ...options,
          ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
        });
        replied = true;
      }
    },
  };
}
