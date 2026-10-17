export class OperationError extends Error {
  constructor(
    readonly code:
      'RESOURCE_BUSY' | 'OPERATION_CANCELLED' | 'OPERATION_TIMEOUT',
  ) {
    super(
      code === 'RESOURCE_BUSY'
        ? 'Kairo is busy. Try again shortly.'
        : code === 'OPERATION_TIMEOUT'
          ? 'The operation timed out.'
          : 'The operation was cancelled.',
    );
    this.name = 'OperationError';
  }
}

/** Observe both outcomes even when cancellation wins; never leave a late rejection unhandled. */
export function abortable<T>(
  work: Promise<T>,
  signal: AbortSignal,
  onLate?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const abort = () => {
      if (done) return;
      done = true;
      signal.removeEventListener('abort', abort);
      reject(
        signal.reason instanceof OperationError
          ? signal.reason
          : new OperationError('OPERATION_CANCELLED'),
      );
    };
    signal.addEventListener('abort', abort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (done) {
          onLate?.(value);
          return;
        }
        done = true;
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        if (!done) {
          done = true;
          reject(error);
        }
      },
    );
    if (signal.aborted) abort();
  });
}

export class WorkScope {
  private readonly root = new AbortController();
  private readonly jobs = new Set<AbortController>();
  constructor(
    private readonly timeoutMs = 30_000,
    private readonly maxActive = 128,
  ) {
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs < 1 ||
      !Number.isInteger(maxActive) ||
      maxActive < 1
    )
      throw new RangeError('Invalid work limits.');
  }
  get active() {
    return this.jobs.size;
  }
  get signal(): AbortSignal {
    return this.root.signal;
  }
  async run<T>(
    work: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    if (this.signal.aborted || signal?.aborted)
      throw new OperationError('OPERATION_CANCELLED');
    if (this.active >= this.maxActive)
      throw new OperationError('RESOURCE_BUSY');
    const controller = new AbortController();
    this.jobs.add(controller);
    const timer = setTimeout(
      () => controller.abort(new OperationError('OPERATION_TIMEOUT')),
      timeoutMs,
    );
    const combined = AbortSignal.any([
      this.signal,
      controller.signal,
      ...(signal ? [signal] : []),
    ]);
    try {
      return await abortable(
        Promise.resolve().then(() => {
          if (combined.aborted) throw new OperationError('OPERATION_CANCELLED');
          return work(combined);
        }),
        combined,
      );
    } finally {
      clearTimeout(timer);
      this.jobs.delete(controller);
    }
  }
  close() {
    this.root.abort(new OperationError('OPERATION_CANCELLED'));
  }
}

interface Waiter {
  key: string;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abort: () => void;
}
/** Bounded round-robin admission by guild. Active noncooperative work keeps its slot. */
export class FairLimiter {
  private active = 0;
  private readonly counts = new Map<string, number>();
  private waiting: Waiter[] = [];
  private readonly served = new Map<string, number>();
  private sequence = 0;
  private closed = false;
  constructor(
    private readonly limit: number,
    private readonly perKey = limit,
    private readonly maxWaiting = 64,
  ) {
    if (
      ![limit, perKey].every((n) => Number.isInteger(n) && n > 0) ||
      !Number.isInteger(maxWaiting) ||
      maxWaiting < 0
    )
      throw new RangeError('Invalid admission limits.');
  }
  snapshot() {
    return {
      active: this.active,
      waiting: this.waiting.length,
      limit: this.limit,
    };
  }
  acquire(key: string, signal?: AbortSignal): Promise<() => void> {
    if (this.closed || signal?.aborted)
      return Promise.reject(new OperationError('OPERATION_CANCELLED'));
    if (
      !this.waiting.length &&
      this.active < this.limit &&
      (this.counts.get(key) ?? 0) < this.perKey
    )
      return Promise.resolve(this.admit(key));
    if (this.waiting.length >= this.maxWaiting)
      return Promise.reject(new OperationError('RESOURCE_BUSY'));
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        key,
        resolve,
        reject,
        ...(signal ? { signal } : {}),
        abort: () => {
          this.waiting = this.waiting.filter((item) => item !== waiter);
          signal?.removeEventListener('abort', waiter.abort);
          reject(new OperationError('OPERATION_CANCELLED'));
        },
      };
      this.waiting.push(waiter);
      signal?.addEventListener('abort', waiter.abort, { once: true });
      this.pump();
    });
  }
  tryAcquire(key: string): () => void {
    if (this.closed) throw new OperationError('OPERATION_CANCELLED');
    if (this.active >= this.limit || (this.counts.get(key) ?? 0) >= this.perKey)
      throw new OperationError('RESOURCE_BUSY');
    return this.admit(key);
  }
  private admit(key: string) {
    this.active++;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.served.set(key, ++this.sequence);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const remaining = (this.counts.get(key) ?? 1) - 1;
      if (remaining) this.counts.set(key, remaining);
      else this.counts.delete(key);
      this.pump();
      if (!this.counts.has(key) && !this.waiting.some((w) => w.key === key))
        this.served.delete(key);
    };
  }
  private pump() {
    while (!this.closed && this.active < this.limit) {
      const eligible = (w: Waiter) =>
        (this.counts.get(w.key) ?? 0) < this.perKey;
      const keys = [
        ...new Set(this.waiting.filter(eligible).map((w) => w.key)),
      ].sort((a, b) => (this.served.get(a) ?? 0) - (this.served.get(b) ?? 0));
      const nextKey = keys[0];
      let index = this.waiting.findIndex(
        (w) => w.key === nextKey && eligible(w),
      );
      if (index < 0) index = this.waiting.findIndex(eligible);
      if (index < 0) break;
      const [waiter] = this.waiting.splice(index, 1);
      waiter!.signal?.removeEventListener('abort', waiter!.abort);
      waiter!.resolve(this.admit(waiter!.key));
    }
  }
  async run<T>(
    key: string,
    work: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const release = await this.acquire(key, signal);
    try {
      return await work();
    } finally {
      release();
    }
  }
  close() {
    this.closed = true;
    for (const waiter of this.waiting.splice(0)) {
      waiter.signal?.removeEventListener('abort', waiter.abort);
      waiter.reject(new OperationError('OPERATION_CANCELLED'));
    }
  }
}
