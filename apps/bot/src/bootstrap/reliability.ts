import { spawn as nodeSpawn } from 'node:child_process';
import { WorkScope, OperationError } from '@kairo/shared';

export interface StartupCheck {
  name: string;
  required: boolean;
  run(signal: AbortSignal): Promise<void>;
}
export interface StartupResult {
  name: string;
  status: 'ok' | 'degraded' | 'fatal';
  code: string;
}
export async function runSelfTest(
  checks: StartupCheck[],
  timeoutMs = 5000,
): Promise<StartupResult[]> {
  const scope = new WorkScope(timeoutMs);
  try {
    return await Promise.all(
      checks.map(async (check): Promise<StartupResult> => {
        try {
          await scope.run(check.run);
          return { name: check.name, status: 'ok', code: 'CHECK_OK' };
        } catch {
          return {
            name: check.name,
            status: check.required ? 'fatal' : 'degraded',
            code: 'CHECK_FAILED',
          };
        }
      }),
    );
  } finally {
    scope.close();
  }
}
export function executableCheck(
  executable: string,
  args: string[],
  signal: AbortSignal,
  spawn = nodeSpawn,
): Promise<void> {
  if (signal.aborted)
    return Promise.reject(new OperationError('OPERATION_CANCELLED'));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      signal.removeEventListener('abort', abort);
      if (ok) resolve();
      else reject(new Error('Executable check failed.'));
    };
    const abort = () => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* Already exited. */
      }
      finish(false);
    };
    signal.addEventListener('abort', abort, { once: true });
    child.once('error', () => finish(false));
    child.once('close', (code) => finish(code === 0));
    if (signal.aborted) abort();
  });
}
export interface ShutdownStep {
  name: string;
  run(): void | Promise<void>;
}
export class ShutdownCoordinator {
  private work?: Promise<{ failures: string[] }>;
  constructor(
    private readonly steps: ShutdownStep[],
    private readonly timeoutMs = 30_000,
    private readonly stepTimeoutMs = 3000,
    private readonly report: (step: string) => void = () => {},
  ) {}
  close(): Promise<{ failures: string[] }> {
    this.work ??= this.run();
    return this.work;
  }
  private async run() {
    const failures: string[] = [];
    const deadline = Date.now() + this.timeoutMs;
    const scope = new WorkScope(this.stepTimeoutMs);
    for (const step of this.steps) {
      try {
        await scope.run(
          async () => {
            await step.run();
          },
          undefined,
          Math.max(1, Math.min(this.stepTimeoutMs, deadline - Date.now())),
        );
      } catch {
        failures.push(step.name);
        try {
          this.report(step.name);
        } catch {
          /* Diagnostics cannot interrupt cleanup. */
        }
      }
    }
    scope.close();
    return { failures };
  }
}
export interface ScopedCollector {
  once(event: 'end', callback: () => void): unknown;
  stop(reason?: string): unknown;
}
export class UiLifecycle {
  private readonly collectors = new Set<ScopedCollector>();
  private closed = false;
  track(collector: ScopedCollector): void {
    if (this.closed || this.collectors.size >= 256) {
      collector.stop('shutdown');
      throw new OperationError(
        this.closed ? 'OPERATION_CANCELLED' : 'RESOURCE_BUSY',
      );
    }
    this.collectors.add(collector);
    collector.once('end', () => this.collectors.delete(collector));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const collector of this.collectors) {
      try {
        collector.stop('shutdown');
      } catch {
        /* Continue remaining cleanup. */
      }
    }
    this.collectors.clear();
  }
}
