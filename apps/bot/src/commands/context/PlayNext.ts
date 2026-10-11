import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
} from 'discord.js';
import type { MessageCommand } from '../types.js';
import { executeMessage } from './helpers.js';
const command: MessageCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Play Next')
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),
  category: 'Music',
  usage: 'Message > Apps > Play Next',
  admission: 'playnext',
  execute: (i, c) => executeMessage(i, c, 'playnext'),
};
export default command;
