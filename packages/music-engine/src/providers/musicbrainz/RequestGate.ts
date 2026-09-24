export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** Serializes outbound requests and spaces them by at least one interval. */
export class RequestGate {
  private nextAt = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number,
    private readonly sleep: Sleep,
  ) {}

  wait(signal?: AbortSignal): Promise<void> {
    const task = this.tail.then(async () => {
      if (signal?.aborted) throw signal.reason;
      const delay = Math.max(0, this.nextAt - this.now());
      if (delay > 0) await this.sleep(delay, signal);
      if (signal?.aborted) throw signal.reason;
      this.nextAt = this.now() + this.intervalMs;
    });
    this.tail = task.catch(() => {});
    return task;
  }
}
