import type { MusicErrorCode } from './errors.js';

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
  | (ParseEventContext & { type: 'parseFailed'; code: MusicErrorCode });

export type Unsubscribe = () => void;
