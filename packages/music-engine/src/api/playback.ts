import type {
  DiscordGatewayAdapterCreator,
  AudioPlayer,
  VoiceConnection,
} from '@discordjs/voice';
import type { QueueEntry } from './queue.js';
import type { PlaybackState } from '../playback/PlaybackStateMachine.js';

export interface VoiceTarget {
  guildId: string;
  channelId: string;
  adapterCreator: DiscordGatewayAdapterCreator;
}

export interface PlaybackSnapshot {
  guildId: string;
  state: PlaybackState;
  current: QueueEntry | undefined;
  generation: number;
}

/** Optional transport seam for deterministic tests and alternate host runtimes. */
export interface PlaybackRuntime {
  joinVoiceChannel?: typeof import('@discordjs/voice').joinVoiceChannel;
  waitVoiceReady?: (connection: VoiceConnection) => Promise<VoiceConnection>;
  createAudioPlayer?: () => AudioPlayer;
  createAudioResource?: typeof import('@discordjs/voice').createAudioResource;
}
