import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
} from 'discord.js';
import type { MessageCommand } from '../types.js';
import { executeMessage } from './helpers.js';
const command: MessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Play Song')
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  category: 'Music',
  usage: 'Message > Apps > Play Song',
  admission: 'play',
  execute: (i, c) => executeMessage(i, c, 'play'),
};
export default command;
