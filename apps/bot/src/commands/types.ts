import type { VoiceTarget } from '@kairo/music-engine';
import type { InteractionReplyOptions, MessageFlags } from 'discord.js';

export interface CommandRequest {
  name: string;
  userId: string;
  guildId?: string;
  voiceChannelId?: string | undefined;
  voiceTarget?: VoiceTarget;
  query?: string;
  page?: number;
  timeoutSeconds?: number;
  audioQuality?: 'low' | 'medium' | 'high' | 'best';
  canManageGuild?: boolean;
  createdTimestamp: number;
  websocketPing?: number;
  interactionid?: number;
  defer(): Promise<void>;
  respond(reply: CommandReply): Promise<void>;
}

export interface CommandContext extends CommandRequest {
  isDeveloper: boolean;
}

export interface CommandReply {
  content?: string;
  components?: InteractionReplyOptions['components'];
  ephemeral?: boolean;
  flags?: MessageFlags;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  category: 'Music' | 'Utility' | 'Developer';
  queryOption?: boolean;
  pageOption?: boolean;
  timeoutOption?: boolean;
  audioQualityOption?: boolean;
  defer?: boolean;
  developerOnly?: boolean;
  execute(context: CommandContext): Promise<CommandReply>;
}
