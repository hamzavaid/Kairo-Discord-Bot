import type { VoiceTarget } from '@kairo/music-engine';

export interface CommandRequest {
  name: string;
  userId: string;
  guildId?: string;
  voiceChannelId?: string | undefined;
  voiceTarget?: VoiceTarget;
  query?: string;
  page?: number;
  timeoutSeconds?: number;
  canManageGuild?: boolean;
  createdTimestamp: number;
  websocketPing?: number;
  defer(): Promise<void>;
  respond(content: string, ephemeral: boolean): Promise<void>;
}

export interface CommandContext extends CommandRequest {
  isDeveloper: boolean;
}

export interface CommandReply {
  content: string;
  ephemeral?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  category: 'Music' | 'Utility' | 'Developer';
  queryOption?: boolean;
  pageOption?: boolean;
  timeoutOption?: boolean;
  defer?: boolean;
  developerOnly?: boolean;
  execute(context: CommandContext): Promise<CommandReply>;
}
