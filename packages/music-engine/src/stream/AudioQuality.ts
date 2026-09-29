export type AudioQuality = 'low' | 'medium' | 'high' | 'best';
export const DEFAULT_AUDIO_QUALITY: AudioQuality = 'high';

export interface StreamContext {
  guildId?: string;
  audioQuality: AudioQuality;
}
