import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { FairLimiter, Metrics, OperationError } from '@kairo/shared';
import { MusicError } from '../api/errors.js';
type Kind = 'ffmpeg' | 'yt-dlp';
interface Owned {
  kind: Kind;
  owner: string;
  child: ChildProcessWithoutNullStreams;
  release: () => void;
  timer: NodeJS.Timeout;
  stopping: boolean;
}
/** Accounts only child processes created by this engine; never scans the OS. */
export class ProcessRegistry {
  private readonly pools: Record<Kind, FairLimiter>;
  private readonly owned = new Map<ChildProcessWithoutNullStreams, Owned>();
  private readonly waiters = new Set<() => void>();
  constructor(
    limit = 8,
    private readonly metrics = new Metrics(),
    private readonly startupMs = 5000,
  ) {
    this.pools = {
      ffmpeg: new FairLimiter(limit, 2, 0),
      'yt-dlp': new FairLimiter(limit * 2, 4, 0),
    };
  }
  spawn(
    kind: Kind,
    owner: string,
    executable: string,
    args: string[],
    spawn: typeof nodeSpawn = nodeSpawn,
  ): ChildProcessWithoutNullStreams {
    let release: () => void;
    try {
      release = this.pools[kind].tryAcquire(owner);
    } catch (error) {
      this.metrics.increment('backpressure_rejections_total');
      throw new MusicError(
        error instanceof OperationError && error.code === 'OPERATION_CANCELLED'
          ? 'STREAM_CANCELLED'
          : 'RESOURCE_BUSY',
        'Audio process capacity is unavailable.',
        true,
      );
    }
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }) as ChildProcessWithoutNullStreams;
    } catch (error) {
      release();
      throw error;
    }
    const timer = setTimeout(() => {
      if (!this.owned.has(child)) return;
      child.stdout.destroy(
        new MusicError(
          kind === 'ffmpeg' ? 'FFMPEG_ERROR' : 'STREAM_TIMEOUT',
          'Audio process startup timed out.',
          true,
        ),
      );
      this.terminate(child);
    }, this.startupMs);
    timer.unref();
    const record: Owned = {
      child,
      kind,
      owner,
      release,
      timer,
      stopping: false,
    };
    this.owned.set(child, record);
    child.stdout.on('error', () => {});
    child.once('spawn', () => clearTimeout(timer));
    const finish = () => {
      clearTimeout(timer);
      if (!this.owned.delete(child)) return;
      release();
      this.metrics.set('ffmpeg_processes', this.snapshot().ffmpeg);
      for (const check of this.waiters) check();
    };
    const exited = (code: number | null) => {
      if (!record.stopping && code !== 0)
        child.stdout.destroy(
          new MusicError(
            kind === 'ffmpeg' ? 'FFMPEG_ERROR' : 'STREAM_UNAVAILABLE',
            'Audio process failed.',
            true,
          ),
        );
      finish();
    };
    child.once('exit', exited);
    child.once('close', exited);
    child.on('error', () => {});
    child.once('error', () => {
      if (child.pid === undefined) finish();
      else this.terminate(child);
    });
    this.metrics.set('ffmpeg_processes', this.snapshot().ffmpeg);
    return child;
  }
  terminate(child: ChildProcessWithoutNullStreams) {
    const record = this.owned.get(child);
    if (!record || record.stopping) return;
    record.stopping = true;
    clearTimeout(record.timer);
    try {
      child.kill('SIGKILL');
    } catch {
      /* Failed startup/already-exited race. */
    }
    if (child.pid === undefined) {
      // No OS process was created (also supports the injected process transport).
      this.owned.delete(child);
      record.release();
      this.metrics.set('ffmpeg_processes', this.snapshot().ffmpeg);
      for (const check of this.waiters) check();
    }
  }
  sweep(ownerActive: (owner: string) => boolean): number {
    let cleaned = 0;
    for (const record of this.owned.values())
      if (!record.stopping && !ownerActive(record.owner)) {
        record.child.stdout.destroy(
          new MusicError(
            'STREAM_CANCELLED',
            'Orphan audio process was stopped.',
          ),
        );
        this.terminate(record.child);
        cleaned++;
      }
    if (cleaned) this.metrics.increment('watchdog_cleanups_total', cleaned);
    return cleaned;
  }
  snapshot() {
    return {
      ffmpeg: [...this.owned.values()].filter((r) => r.kind === 'ffmpeg')
        .length,
      ytDlp: [...this.owned.values()].filter((r) => r.kind === 'yt-dlp').length,
    };
  }
  close() {
    for (const child of this.owned.keys()) this.terminate(child);
    Object.values(this.pools).forEach((pool) => pool.close());
  }
  drain(timeoutMs = 1000): Promise<void> {
    if (!this.owned.size) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => {
        if (this.owned.size) return;
        clearTimeout(timer);
        this.waiters.delete(finish);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiters.delete(finish);
        reject(
          new MusicError(
            'FFMPEG_ERROR',
            'Media process exit could not be confirmed.',
          ),
        );
      }, timeoutMs);
      this.waiters.add(finish);
      finish();
    });
  }
}
