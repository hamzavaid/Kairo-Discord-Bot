import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
} from 'discord.js';
import type { MessageCommand } from '../types.js';
import { executeMessage } from './helpers.js';
const command: MessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Song Info')
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  category: 'Music',
  usage: 'Message > Apps > Song Info',
  admission: 'info',
  execute: (i, c) => executeMessage(i, c, 'info'),
};
export default command;
