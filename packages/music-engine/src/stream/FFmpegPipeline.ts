import { validateSeekPosition } from '../api/seek.js';
import { createReadStream } from 'node:fs';
import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import type { AudioSource, PreparedAudio } from './AudioSource.js';
import { AudioProbe } from './AudioProbe.js';
import {
  FILTER_GRAPHS,
  validateFilter,
  type FilterPreset,
} from '../playback/PlaybackControls.js';
import { MusicError } from '../api/errors.js';
import type { ProcessRegistry } from '../reliability/ProcessRegistry.js';

export interface FFmpegOptions {
  resources?: ProcessRegistry;
  owner?: string;
  executable?: string;
  spawn?: typeof nodeSpawn;
}

export class FFmpegPipeline {
  private readonly spawn: typeof nodeSpawn;
  private readonly executable: string;
  constructor(private readonly options: FFmpegOptions = {}) {
    this.spawn = options.spawn ?? nodeSpawn;
    this.executable = options.executable ?? 'ffmpeg';
  }

  prepare(
    source: AudioSource,
    filter: FilterPreset = 'flat',
    offsetMs = 0,
    inlineVolume = false,
  ): PreparedAudio {
    validateSeekPosition(offsetMs);
    if (offsetMs && !source.seekable)
      throw new MusicError(
        'SEEK_UNSUPPORTED',
        'This audio source cannot be seeked.',
      );
    validateFilter(filter);
    const canApplyVolumeWithoutFFmpeg =
      !inlineVolume ||
      source.inputType === 'opus' ||
      source.inputType === 'raw';
    if (
      !offsetMs &&
      filter === 'flat' &&
      canApplyVolumeWithoutFFmpeg &&
      !new AudioProbe().inspect(source).needsTranscode
    ) {
      const input =
        source.kind === 'file' ? createReadStream(source.input) : source.input;
      let closed = false;
      return {
        input,
        inputType: source.inputType,
        dispose: () => {
          if (closed) return;
          closed = true;
          try {
            input.destroy();
          } finally {
            try {
              source.dispose?.();
            } catch {
              /* Independent upstream cleanup. */
            }
          }
        },
      };
    }
    const args = [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      ...(offsetMs && source.kind === 'file'
        ? ['-ss', String(offsetMs / 1000)]
        : []),
      '-i',
      source.kind === 'file' ? source.input : 'pipe:0',
      ...(offsetMs && source.kind !== 'file'
        ? ['-ss', String(offsetMs / 1000)]
        : []),
      '-vn',
      ...(filter === 'flat' ? [] : ['-af', FILTER_GRAPHS[filter]]),
      ...(inlineVolume
        ? ['-c:a', 'pcm_s16le', '-f', 's16le', '-ar', '48000', '-ac', '2']
        : ['-c:a', 'libopus', '-f', 'ogg']),
      'pipe:1',
    ];
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.options.resources
        ? this.options.resources.spawn(
            'ffmpeg',
            this.options.owner ?? 'local',
            this.executable,
            args,
            this.spawn,
          )
        : (this.spawn(this.executable, args, {
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          }) as ChildProcessWithoutNullStreams);
    } catch (error) {
      if (source.kind === 'readable') source.input.destroy();
      try {
        source.dispose?.();
      } catch {
        /* Retain the typed startup error. */
      }
      if (error instanceof MusicError) throw error;
      throw new MusicError('FFMPEG_ERROR', 'Audio conversion could not start.');
    }
    let closed = false;
    const dispose = () => {
      if (closed) return;
      closed = true;
      for (const cleanup of [
        () => {
          if (source.kind === 'readable') {
            source.input.unpipe(child.stdin);
            source.input.destroy();
          }
        },
        () => source.dispose?.(),
        () => child.stdin.destroy(),
        () => child.stdout.destroy(),
        () => child.stderr.destroy(),
      ]) {
        try {
          cleanup();
        } catch {
          /* Always reach process termination. */
        }
      }
      try {
        if (this.options.resources) this.options.resources.terminate(child);
        else child.kill();
      } catch {
        // Cleanup remains idempotent when the process exits concurrently.
      }
    };
    // Drain diagnostics without retaining raw input or unbounded stderr.
    child.stderr.on('data', () => {});
    child.stderr.on('error', () => {});
    child.stdout.on('error', () => {});
    const fail = () => {
      if (!closed)
        child.stdout.destroy(
          new MusicError('FFMPEG_ERROR', 'Audio conversion failed.', true),
        );
      dispose();
    };
    child.on('error', fail);
    child.on('exit', (code) => {
      if (code !== 0 && !closed) fail();
    });
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
    return {
      input: child.stdout,
      inputType: inlineVolume ? 'raw' : 'ogg/opus',
      dispose,
    };
  }
}
