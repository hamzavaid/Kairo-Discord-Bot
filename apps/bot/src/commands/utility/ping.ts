import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types.js';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Show bot latency'),
  usage: '/ping',
  category: 'Utility',
  async execute(interaction) {
    const api = Math.max(0, Date.now() - interaction.createdTimestamp);
    const ws = interaction.client.ws.ping;
    await interaction.reply({
      content: `API: ${api} ms | WebSocket: ${ws < 0 ? 'unavailable' : `${ws} ms`}`,
    });
  },
};

export default command;
