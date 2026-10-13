import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageFlags,
} from 'discord.js';
import { GameError } from '@kairo/games';
import type { UserCommand } from '../types.js';
import { gamesBrowser } from '../games/GamesBrowser.js';
const command: UserCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Invite to Game')
    .setType(ApplicationCommandType.User)
    .setContexts(InteractionContextType.Guild),
  category: 'Games',
  usage: 'User > Apps > Invite to Game',
  async execute(i, c) {
    if (i.targetUser.bot || i.targetUser.id === i.user.id)
      throw new GameError('GAME_INVALID', 'Invite another human player.');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await gamesBrowser(i, c, i.targetUser.id);
  },
};
export default command;
