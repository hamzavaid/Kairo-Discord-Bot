import type { CommandDefinition } from '../types.js';

export function createPingCommand(): CommandDefinition {
  return {
    name: 'ping',
    description: 'Show bot latency',
    usage: '/ping',
    category: 'Utility',
    async execute(context) {
      const api = Math.max(0, Date.now() - context.createdTimestamp);
      const ws = context.websocketPing;
      return {
        content: `API: ${api} ms | WebSocket: ${ws === undefined || ws < 0 ? 'unavailable' : `${ws} ms`}`,
      };
    },
  };
}
