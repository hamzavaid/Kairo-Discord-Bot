import { describe, expect, it } from 'vitest';
import { PlaybackStateMachine } from '../packages/music-engine/src/playback/PlaybackStateMachine.js';
import { createKairoMusicEngine } from '@kairo/music-engine';

describe('Phase 5 playback state machine', () => {
  it('accepts the connection, resolution, play, pause, and stop path', () => {
    const machine = new PlaybackStateMachine();
    expect(machine.state).toBe('DISCONNECTED');
    for (const state of [
      'CONNECTING',
      'IDLE',
      'RESOLVING',
      'BUFFERING',
      'PLAYING',
      'PAUSED',
      'PLAYING',
      'STOPPING',
      'IDLE',
      'DISCONNECTED',
    ] as const)
      machine.transition(state);
    expect(machine.state).toBe('DISCONNECTED');
  });

  it('rejects illegal transitions with a typed code and preserves state', () => {
    const machine = new PlaybackStateMachine();
    expect(() => machine.transition('PLAYING')).toThrow(
      expect.objectContaining({ code: 'INVALID_PLAYBACK_TRANSITION' }),
    );
    expect(machine.state).toBe('DISCONNECTED');
  });

  it('supports failure and recovery paths', () => {
    const machine = new PlaybackStateMachine();
    machine.transition('CONNECTING');
    machine.transition('ERROR');
    machine.transition('DISCONNECTED');
    machine.transition('CONNECTING');
    machine.transition('IDLE');
    machine.transition('RESOLVING');
    machine.transition('ERROR');
    machine.transition('STOPPING');
    machine.transition('IDLE');
    expect(machine.state).toBe('IDLE');
  });

  it('rejects invalid playback timeout and FFmpeg configuration at construction', () => {
    expect(() => createKairoMusicEngine({ bufferTimeoutMs: 0 })).toThrow();
    expect(() => createKairoMusicEngine({ streamTimeoutMs: 0 })).toThrow();
    expect(() => createKairoMusicEngine({ ffmpegPath: '' })).toThrow();
  });
});
