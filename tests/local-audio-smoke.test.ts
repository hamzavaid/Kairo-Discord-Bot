import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  createAudioPlayer,
  createAudioResource,
  entersState,
} from '@discordjs/voice';
import { describe, expect, it } from 'vitest';
import { FixtureStreamProvider } from '../packages/music-engine/src/stream/FixtureStreamProvider.js';
import { StreamResolver } from '../packages/music-engine/src/stream/StreamResolver.js';
import { FFmpegPipeline } from '../packages/music-engine/src/stream/FFmpegPipeline.js';
import type { Track } from '@kairo/music-engine';

const track: Track = {
  id: 'fixture:silence',
  sourceId: 'silence',
  sourceProvider: 'fixture',
  title: 'Silence',
  artists: [{ name: 'Fixture' }],
  isLive: false,
  requestedBy: 'user',
  provenance: { input: 'silence', parsedBy: 'fixture' },
  createdAt: new Date(),
};

describe('local audio pipeline smoke', () => {
  it('plays configured Opus fixture packets with the real @discordjs/voice player', async () => {
    const packets = Array.from({ length: 30 }, () =>
      Uint8Array.from([0xf8, 0xff, 0xfe]),
    );
    const source = await new StreamResolver([
      new FixtureStreamProvider({ silence: { packets } }),
    ]).resolve(track, new AbortController().signal);
    const prepared = new FFmpegPipeline().prepare(source);
    expect(prepared.inputType).toBe('opus');
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    try {
      player.play(
        createAudioResource(prepared.input, { inputType: StreamType.Opus }),
      );
      await entersState(player, AudioPlayerStatus.Playing, 2000);
      expect(player.state.status).toBe(AudioPlayerStatus.Playing);
    } finally {
      player.stop(true);
      prepared.dispose();
    }
  });
});
