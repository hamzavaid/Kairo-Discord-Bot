import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
} from 'discord.js';
import type { MessageCommand } from '../types.js';
import { executeMessage } from './helpers.js';
const command: MessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Search Music')
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  category: 'Music',
  usage: 'Message > Apps > Search Music',
  admission: 'info',
  execute: (i, c) => executeMessage(i, c, 'search'),
};
export default command;
