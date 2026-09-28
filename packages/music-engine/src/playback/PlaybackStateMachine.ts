import { MusicError } from '../api/errors.js';

export type PlaybackState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'IDLE'
  | 'RESOLVING'
  | 'BUFFERING'
  | 'PLAYING'
  | 'PAUSED'
  | 'STOPPING'
  | 'ERROR';

const allowed: Readonly<Record<PlaybackState, readonly PlaybackState[]>> = {
  DISCONNECTED: ['CONNECTING'],
  CONNECTING: ['IDLE', 'ERROR', 'DISCONNECTED'],
  IDLE: ['RESOLVING', 'DISCONNECTED', 'STOPPING'],
  RESOLVING: ['BUFFERING', 'STOPPING', 'ERROR', 'DISCONNECTED'],
  BUFFERING: ['PLAYING', 'STOPPING', 'ERROR', 'DISCONNECTED'],
  PLAYING: ['PAUSED', 'STOPPING', 'ERROR', 'DISCONNECTED'],
  PAUSED: ['PLAYING', 'STOPPING', 'ERROR', 'DISCONNECTED'],
  STOPPING: ['IDLE', 'DISCONNECTED', 'ERROR'],
  ERROR: ['STOPPING', 'DISCONNECTED', 'CONNECTING'],
};

export class PlaybackStateMachine {
  state: PlaybackState = 'DISCONNECTED';

  transition(next: PlaybackState): PlaybackState {
    if (!allowed[this.state].includes(next))
      throw new MusicError(
        'INVALID_PLAYBACK_TRANSITION',
        'This playback transition is not allowed.',
      );
    this.state = next;
    return next;
  }
}
