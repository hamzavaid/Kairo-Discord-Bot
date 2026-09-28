import type { MusicErrorCode } from './errors.js';
import type { PlaybackState } from '../playback/PlaybackStateMachine.js';

interface ParseEventContext {
  guildId: string;
  requestedBy: string;
  requestId?: string;
}

export type KairoMusicEvent =
  | (ParseEventContext & {
      type: 'parseSucceeded';
      resultKind: 'track' | 'search';
    })
  | (ParseEventContext & { type: 'parseFailed'; code: MusicErrorCode })
  | {
      type: 'playbackStateChanged';
      guildId: string;
      state: PlaybackState;
      generation: number;
    }
  | {
      type: 'playbackFailed';
      guildId: string;
      code: MusicErrorCode;
      generation: number;
    };

export type Unsubscribe = () => void;
