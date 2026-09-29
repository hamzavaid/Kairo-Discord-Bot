import { createReadStream } from 'node:fs';
import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import type { AudioSource, PreparedAudio } from './AudioSource.js';
import { AudioProbe } from './AudioProbe.js';
import { MusicError } from '../api/errors.js';

export interface FFmpegOptions {
  executable?: string;
  spawn?: typeof nodeSpawn;
}

export class FFmpegPipeline {
  private readonly spawn: typeof nodeSpawn;
  private readonly executable: string;
  constructor(options: FFmpegOptions = {}) {
    this.spawn = options.spawn ?? nodeSpawn;
    this.executable = options.executable ?? 'ffmpeg';
  }

  prepare(source: AudioSource): PreparedAudio {
    if (!new AudioProbe().inspect(source).needsTranscode) {
      const input =
        source.kind === 'file' ? createReadStream(source.input) : source.input;
      let closed = false;
      return {
        input,
        inputType: source.inputType,
        dispose: () => {
          if (closed) return;
          closed = true;
          input.destroy();
          source.dispose?.();
        },
      };
    }
    const args = [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      source.kind === 'file' ? source.input : 'pipe:0',
      '-vn',
      '-c:a',
      'libopus',
      '-f',
      'ogg',
      'pipe:1',
    ];
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawn(this.executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }) as ChildProcessWithoutNullStreams;
    } catch {
      if (source.kind === 'readable') source.input.destroy();
      source.dispose?.();
      throw new MusicError('FFMPEG_ERROR', 'Audio conversion could not start.');
    }
    let closed = false;
    const dispose = () => {
      if (closed) return;
      closed = true;
      if (source.kind === 'readable') source.input.destroy();
      source.dispose?.();
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      child.kill();
    };
    // Drain diagnostics without retaining raw input or unbounded stderr.
    child.stderr.on('data', () => {});
    child.on('error', dispose);
    child.stdin.on('error', dispose);
    if (source.kind === 'readable') {
      source.input.on('error', () => {
        child.stdout.destroy(
          new MusicError('STREAM_UNAVAILABLE', 'Audio streaming failed.', true),
        );
        dispose();
      });
      source.input.pipe(child.stdin);
    }
    return { input: child.stdout, inputType: 'ogg/opus', dispose };
  }
}
