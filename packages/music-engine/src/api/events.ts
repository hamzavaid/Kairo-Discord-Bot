import type { MusicErrorCode } from './errors.js';
import type { PlaybackState } from '../playback/PlaybackStateMachine.js';
import type { AudioQuality } from '../stream/AudioQuality.js';

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
    }
  | {
      type: 'playbackSourceSelected';
      guildId: string;
      generation: number;
      trackId: string;
      metadataProvider: string;
      candidateSearchProvider?: string;
      selectedCandidateId?: string;
      matchConfidence?: number;
      streamProvider: string;
      audioQuality: AudioQuality;
    };

export type Unsubscribe = () => void;
