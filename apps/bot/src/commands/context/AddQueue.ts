import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
} from 'discord.js';
import type { MessageCommand } from '../types.js';
import { executeMessage } from './helpers.js';
const command: MessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Add to Queue')
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  category: 'Music',
  usage: 'Message > Apps > Add to Queue',
  admission: 'play',
  execute: (i, c) => executeMessage(i, c, 'play'),
};
export default command;
